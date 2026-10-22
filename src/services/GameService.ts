// Use cases of the game. Depends only on ports + domain, so every rule
// here is unit tested with in-memory adapters and fakes.
import { DEFAULT_SETTINGS, QUOTE_LENGTHS } from "../config/constants";
import {
    InvalidStateError,
    ForbiddenError,
    NotFoundError,
    RoomFullError,
    ValidationError,
} from "../domain/errors";
import type { ModeRegistry } from "../domain/modes/modeRegistry";
import { cleanNickname, createPlayer, resetForNewRound } from "../domain/players";
import { findPlayer, isFinished, nextHost, racersOf } from "../domain/rules";
import { normalizeSettings } from "../domain/settings";
import type { Game, GameId, Player, Session } from "../domain/types";
import type { ChatRepository } from "../ports/ChatRepository";
import type { Clock } from "../ports/Clock";
import type { GameRepository } from "../ports/GameRepository";
import type { IdGenerator } from "../ports/IdGenerator";
import type { Notifier } from "../ports/Notifier";
import type { RoomMembership } from "../ports/RoomMembership";
import type { QuoteService } from "./QuoteService";
import type { RaceClock } from "./RaceClock";

export interface GameServiceDeps {
    games: GameRepository;
    chat: ChatRepository;
    quotes: QuoteService;
    modes: ModeRegistry;
    raceClock: RaceClock;
    clock: Clock;
    ids: IdGenerator;
    notifier: Notifier;
    rooms: RoomMembership;
}

export interface JoinResult {
    game: Game;
    player: Player;
}

export class GameService {
    constructor(private readonly deps: GameServiceDeps) {}

    async createGame(rawNickname: unknown, socketId: string): Promise<JoinResult> {
        const { games, quotes, clock, ids, notifier, rooms } = this.deps;
        const nickname = this.requireNickname(rawNickname);
        const now = clock.now();
        const settings = { ...DEFAULT_SETTINGS };
        const player = createPlayer({ id: ids.playerId(), nickname, socketId, now, isHost: true });
        const game: Game = {
            id: await this.newRoomCode(),
            phase: "lobby",
            words: await quotes.getWords(QUOTE_LENGTHS[settings.length]),
            players: [player],
            settings,
            round: 1,
            createdAt: now,
        };
        await games.create(game);
        await rooms.join(socketId, game.id); // before broadcasting, so the creator gets it
        notifier.gameChanged(game);
        return { game, player };
    }

    /** Lobby -> joins as a racer. Race started or over -> joins as a spectator. */
    async joinGame(gameId: GameId, rawNickname: unknown, socketId: string): Promise<JoinResult> {
        const { games, clock, ids, notifier, rooms } = this.deps;
        const nickname = this.requireNickname(rawNickname);
        const game = await this.requireGame(gameId);
        const inLobby = game.phase === "lobby" || game.phase === "countdown";
        const player = createPlayer({
            id: ids.playerId(),
            nickname,
            socketId,
            now: clock.now(),
            isSpectator: !inLobby,
        });

        const result = await games.addPlayer(gameId, player, game.settings.maxPlayers);
        if (result === "full") throw new RoomFullError();
        if (result === "not-found") throw new NotFoundError();
        await rooms.join(socketId, gameId);

        const updated = await this.requireGame(gameId);
        notifier.gameChanged(updated);
        return { game: updated, player };
    }

    /** Host only, lobby only. A new quote length fetches a new quote. */
    async updateSettings(session: Session, requested: Record<string, unknown>): Promise<Game> {
        const { games, quotes, notifier } = this.deps;
        const game = await this.requireGame(session.gameId);
        this.requireHost(game, session);
        if (game.phase !== "lobby")
            throw new InvalidStateError("Settings can only change in the lobby");

        const settings = normalizeSettings(requested, game.settings, racersOf(game).length);
        const words =
            settings.length !== game.settings.length
                ? await quotes.getWords(QUOTE_LENGTHS[settings.length])
                : game.words;
        await games.updateMeta(game.id, { settings, words });

        const updated = await this.requireGame(game.id);
        notifier.gameChanged(updated);
        return updated;
    }

    /** Host presses Start. */
    async startRace(session: Session): Promise<void> {
        const game = await this.requireGame(session.gameId);
        this.requireHost(game, session);
        if (game.phase !== "lobby") return; // already counting down / racing
        await this.deps.raceClock.start(game.id);
    }

    /** A player typed a word (+ space). Rules for wrong words come from the game mode. */
    async submitWord(session: Session, rawWord: string): Promise<void> {
        const { games, modes, clock, notifier, raceClock } = this.deps;
        const game = await games.get(session.gameId);
        if (!game || game.phase !== "racing") return;
        const player = findPlayer(game, session.playerId);
        if (!player || player.isSpectator || player.isEliminated || isFinished(game, player))
            return;

        const mode = modes.get(game.settings.mode);
        const now = clock.now();
        const correct = game.words[player.wordIndex] === rawWord.trim();
        const patch = correct
            ? mode.onCorrectWord(player, game, now)
            : mode.onWrongWord(player, game, now);
        if (!patch) return; // e.g. classic ignores wrong words

        await games.updatePlayer(game.id, player.id, patch);
        const updated = await this.requireGame(game.id);
        const me = findPlayer(updated, player.id);
        if (correct && me && isFinished(updated, me)) notifier.playerFinished(me.socketId);
        notifier.gameChanged(updated);
        if (mode.shouldEnd(updated)) await raceClock.finishRace(game.id);
    }

    /** Host starts another round: new quote, everyone back to the start, spectators join in. */
    async rematch(session: Session): Promise<void> {
        const { games, quotes, raceClock, notifier } = this.deps;
        const game = await this.requireGame(session.gameId);
        this.requireHost(game, session);
        if (game.phase !== "over") throw new InvalidStateError("The race isn't over yet");

        raceClock.stop(game.id);
        const words = await quotes.getWords(QUOTE_LENGTHS[game.settings.length]);
        let freeSlots = game.settings.maxPlayers - racersOf(game).length;
        for (const p of game.players) {
            const promote = p.isSpectator && freeSlots > 0;
            if (promote) freeSlots--;
            const reset = resetForNewRound(p);
            await games.updatePlayer(game.id, p.id, {
                wordIndex: reset.wordIndex,
                wpm: reset.wpm,
                isEliminated: reset.isEliminated,
                mistakes: reset.mistakes,
                isSpectator: p.isSpectator && !promote,
            });
        }
        await games.updateMeta(game.id, {
            phase: "lobby",
            words,
            round: game.round + 1,
            startTime: undefined,
        });

        notifier.gameChanged(await this.requireGame(game.id));
        notifier.timer(game.id, { countDown: "", msg: "Waiting for players" });
    }

    /** A player left (or never came back after a disconnect). */
    async leaveGame(gameId: GameId, playerId: string): Promise<void> {
        const { games, chat, raceClock, modes, notifier, rooms } = this.deps;
        const game = await games.get(gameId);
        const leaving = game && findPlayer(game, playerId);
        if (!game || !leaving) return;

        await rooms.leave(leaving.socketId, gameId);
        await games.removePlayer(gameId, playerId);
        let updated = await this.requireGame(gameId);

        if (updated.players.length === 0) {
            raceClock.stop(gameId);
            await chat.clear(gameId);
            await games.delete(gameId);
            return;
        }
        if (!updated.players.some((p) => p.isHost)) {
            const host = nextHost(updated);
            if (host) await games.updatePlayer(gameId, host.id, { isHost: true });
            updated = await this.requireGame(gameId);
        }
        notifier.gameChanged(updated);

        if (updated.phase === "racing" && modes.get(updated.settings.mode).shouldEnd(updated)) {
            await raceClock.finishRace(gameId);
        }
    }

    /** After a reconnect the socket id changes: point the player at the new socket. */
    async reattach(gameId: GameId, playerId: string, socketId: string): Promise<JoinResult> {
        const { games, notifier, rooms } = this.deps;
        const game = await games.get(gameId);
        const player = game && findPlayer(game, playerId);
        if (!game || !player) throw new NotFoundError("You were removed from this game");

        await games.updatePlayer(gameId, playerId, { socketId });
        await rooms.join(socketId, gameId);
        const updated = await this.requireGame(gameId);
        notifier.gameChanged(updated);
        return { game: updated, player: { ...player, socketId } };
    }

    // ───────────── helpers ─────────────

    /** A room code nobody is using (codes are short, so collisions are possible). */
    private async newRoomCode(): Promise<GameId> {
        for (let attempt = 0; attempt < 10; attempt++) {
            const code = this.deps.ids.gameId();
            if (!(await this.deps.games.exists(code))) return code;
        }
        throw new Error("Could not find a free room code");
    }

    private requireNickname(raw: unknown): string {
        const nickname = cleanNickname(raw);
        if (!nickname) throw new ValidationError("Please enter your name");
        return nickname;
    }

    private async requireGame(gameId: GameId): Promise<Game> {
        const game = await this.deps.games.get(gameId);
        if (!game) throw new NotFoundError();
        return game;
    }

    private requireHost(game: Game, session: Session): void {
        if (!findPlayer(game, session.playerId)?.isHost) throw new ForbiddenError();
    }
}
