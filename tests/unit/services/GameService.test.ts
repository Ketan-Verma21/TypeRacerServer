import { beforeEach, describe, expect, it } from "vitest";
import {
    ForbiddenError,
    InvalidStateError,
    NotFoundError,
    RoomFullError,
    ValidationError,
} from "../../../src/domain/errors";
import type { SequentialIdGenerator } from "../../fakes/SequentialIdGenerator";
import { createTestApp } from "../../fakes/testApp";

let app: ReturnType<typeof createTestApp<SequentialIdGenerator>>;

beforeEach(() => {
    app = createTestApp();
});

describe("createGame", () => {
    it("creates a lobby with the creator as host and the quote as words", async () => {
        const { game, player } = await app.gameService.createGame("  Ketan ", "s1");

        expect(game.phase).toBe("lobby");
        expect(game.words).toEqual(["the", "quick", "brown", "fox"]);
        expect(game.settings).toEqual({
            mode: "classic",
            timeLimit: 120,
            length: "medium",
            maxPlayers: 5,
        });
        expect(player).toMatchObject({ nickname: "Ketan", isHost: true, socketId: "s1" });
        expect(app.notifier.lastGame?.id).toBe(game.id);
    });

    it("puts the creator's socket in the game's room", async () => {
        const { game } = await app.gameService.createGame("Ketan", "s1");

        expect(app.notifier.membersOf(game.id)).toEqual(["s1"]);
    });

    it("picks a room code that is not already in use", async () => {
        const first = await app.gameService.createGame("A", "s1");
        app.ids.repeatNext(first.game.id); // the next code collides once

        const second = await app.gameService.createGame("B", "s2");

        expect(second.game.id).not.toBe(first.game.id);
    });

    it("rejects an empty nickname", async () => {
        await expect(app.gameService.createGame("   ", "s1")).rejects.toThrow(ValidationError);
    });

    it("fails (so the player can be told) when the quote API is down", async () => {
        app.quoteProvider.willFail();

        await expect(app.gameService.createGame("Ketan", "s1")).rejects.toThrow();
    });
});

describe("joinGame", () => {
    it("adds a racer while the room is in the lobby", async () => {
        const { gameId } = await app.lobbyWith();

        const { game, player } = await app.gameService.joinGame(gameId, "Guest", "s2");

        expect(player.isSpectator).toBe(false);
        expect(game.players.map((p) => p.nickname)).toEqual(["Host", "Guest"]);
        expect(app.notifier.membersOf(gameId)).toEqual(["s-host", "s2"]);
    });

    it("throws NotFoundError for an unknown game", async () => {
        await expect(app.gameService.joinGame("nope", "Guest", "s2")).rejects.toThrow(
            NotFoundError,
        );
    });

    it("throws RoomFullError when maxPlayers racers are in", async () => {
        const { gameId, host } = await app.lobbyWith("a");
        await app.gameService.updateSettings(host, { maxPlayers: 2 });

        await expect(app.gameService.joinGame(gameId, "late", "s3")).rejects.toThrow(RoomFullError);
    });

    it("joins as a spectator once the race has started", async () => {
        const { gameId, host } = await app.lobbyWith();
        await app.startRace(host);

        const { player } = await app.gameService.joinGame(gameId, "Watcher", "s9");

        expect(player.isSpectator).toBe(true);
    });
});

describe("updateSettings", () => {
    it("lets the host change settings", async () => {
        const { host } = await app.lobbyWith();

        const game = await app.gameService.updateSettings(host, {
            mode: "sudden-death",
            timeLimit: 30,
        });

        expect(game.settings).toMatchObject({ mode: "sudden-death", timeLimit: 30 });
    });

    it("refuses a guest", async () => {
        const { guests } = await app.lobbyWith("guest");

        await expect(
            app.gameService.updateSettings(guests[0]!, { mode: "sudden-death" }),
        ).rejects.toThrow(ForbiddenError);
    });

    it("refuses changes once the race is starting", async () => {
        const { host } = await app.lobbyWith();
        await app.gameService.startRace(host);

        await expect(app.gameService.updateSettings(host, { timeLimit: 30 })).rejects.toThrow(
            InvalidStateError,
        );
    });

    it("fetches a new quote only when the quote length changes", async () => {
        const { host } = await app.lobbyWith();
        const callsAfterCreate = app.quoteProvider.calls;

        await app.gameService.updateSettings(host, { timeLimit: 60 });
        expect(app.quoteProvider.calls).toBe(callsAfterCreate);

        app.quoteProvider.willReturn("a brand new quote");
        const game = await app.gameService.updateSettings(host, { length: "long" });
        expect(app.quoteProvider.calls).toBeGreaterThan(callsAfterCreate);
        expect(game.words).toEqual(["a", "brand", "new", "quote"]);
    });
});

describe("startRace", () => {
    it("ignores a guest pressing Start", async () => {
        const { guests } = await app.lobbyWith("guest");

        await expect(app.gameService.startRace(guests[0]!)).rejects.toThrow(ForbiddenError);
        expect(app.raceClock.isRunning(guests[0]!.gameId)).toBe(false);
    });

    it("counts down 5..0, then starts the race clock", async () => {
        const { host, gameId } = await app.lobbyWith();

        await app.startRace(host);

        const timers = app.notifier.ofType("timer").map((t) => t.update);
        expect(timers.slice(0, 6).map((t) => t.countDown)).toEqual([5, 4, 3, 2, 1, 0]);
        expect(timers[6]).toEqual({ countDown: "2:00", msg: "Time Remaining" });
        const game = await app.games.get(gameId);
        expect(game?.phase).toBe("racing");
        expect(game?.startTime).toBe(app.clock.now());
    });

    it("does not start a second countdown when Start is pressed twice", async () => {
        const { host } = await app.lobbyWith();

        await app.gameService.startRace(host);
        await app.gameService.startRace(host);
        await app.scheduler.tick(1);

        expect(app.notifier.ofType("timer")).toHaveLength(1);
    });
});

describe("submitWord", () => {
    it("moves the player forward on a correct word", async () => {
        const { host, gameId } = await app.lobbyWith();
        await app.startRace(host);

        await app.gameService.submitWord(host, "the ");

        expect((await app.games.get(gameId))!.players[0]!.wordIndex).toBe(1);
    });

    it("is ignored before the race starts", async () => {
        const { host, gameId } = await app.lobbyWith();

        await app.gameService.submitWord(host, "the ");

        expect((await app.games.get(gameId))!.players[0]!.wordIndex).toBe(0);
    });

    it("classic: a wrong word changes nothing and sends nothing", async () => {
        const { host, gameId } = await app.lobbyWith();
        await app.startRace(host);
        app.notifier.clear();

        await app.gameService.submitWord(host, "nope ");

        expect((await app.games.get(gameId))!.players[0]!.wordIndex).toBe(0);
        expect(app.notifier.ofType("gameChanged")).toHaveLength(0);
    });

    it("flawless: a wrong word sends the player back to the start", async () => {
        const { host, gameId } = await app.lobbyWith();
        await app.gameService.updateSettings(host, { mode: "no-mistakes" });
        await app.startRace(host);
        await app.gameService.submitWord(host, "the ");
        await app.gameService.submitWord(host, "quick ");

        await app.gameService.submitWord(host, "wrong ");

        expect((await app.games.get(gameId))!.players[0]).toMatchObject({
            wordIndex: 0,
            mistakes: 1,
        });
    });

    it("sudden death: a wrong word eliminates the player", async () => {
        const { host, guests, gameId } = await app.lobbyWith("guest");
        await app.gameService.updateSettings(host, { mode: "sudden-death" });
        await app.startRace(host);

        await app.gameService.submitWord(guests[0]!, "wrong ");

        const guest = (await app.games.get(gameId))!.players[1]!;
        expect(guest.isEliminated).toBe(true);
    });

    it("tells the finisher, records their WPM and ends the race when everyone is done", async () => {
        const { host, guests, gameId } = await app.lobbyWith("guest");
        await app.startRace(host);
        app.clock.advance(30_000); // 4 words in 30 s = 8 WPM

        await app.typeAll(host);

        expect(app.notifier.ofType("playerFinished")).toEqual([
            { type: "playerFinished", socketId: "s-host" },
        ]);
        expect((await app.games.get(gameId))!.players[0]!.wpm).toBe(8);
        expect((await app.games.get(gameId))!.phase).toBe("racing"); // guest still typing

        await app.typeAll(guests[0]!);

        expect((await app.games.get(gameId))!.phase).toBe("over");
        expect(app.notifier.ofType("raceOver")).toHaveLength(1);
    });

    it("ignores spectators", async () => {
        const { host, gameId } = await app.lobbyWith();
        await app.startRace(host);
        const watcher = app.sessionOf(await app.gameService.joinGame(gameId, "Watcher", "s-w"));

        await app.gameService.submitWord(watcher, "the ");

        expect((await app.games.get(gameId))!.players[1]!.wordIndex).toBe(0);
    });
});

describe("race clock", () => {
    it("ends the race when time runs out and fills in WPM for unfinished players", async () => {
        const { host, gameId } = await app.lobbyWith();
        await app.gameService.updateSettings(host, { timeLimit: 30 });
        await app.startRace(host);
        await app.gameService.submitWord(host, "the ");

        await app.scheduler.tick(31); // 0:29 .. 0:00, then time's up

        const game = await app.games.get(gameId);
        expect(game!.phase).toBe("over");
        expect(game!.players[0]!.wpm).toBeGreaterThan(-1);
        expect(app.raceClock.isRunning(gameId)).toBe(false);
    });
});

describe("rematch", () => {
    async function finishedRaceWithSpectator() {
        const { host, guests, gameId } = await app.lobbyWith("guest");
        await app.startRace(host);
        await app.gameService.joinGame(gameId, "Watcher", "s-w");
        await app.typeAll(host);
        await app.typeAll(guests[0]!);
        return { host, guests, gameId };
    }

    it("resets everyone, promotes spectators and goes back to the lobby with a new quote", async () => {
        const { host, gameId } = await finishedRaceWithSpectator();
        app.quoteProvider.willReturn("round two words");

        await app.gameService.rematch(host);

        const game = (await app.games.get(gameId))!;
        expect(game).toMatchObject({ phase: "lobby", round: 2, words: ["round", "two", "words"] });
        expect(game.startTime).toBeUndefined();
        expect(game.players.every((p) => p.wordIndex === 0 && p.wpm === -1 && !p.isSpectator)).toBe(
            true,
        );
        expect(app.notifier.ofType("timer").at(-1)?.update.msg).toBe("Waiting for players");
    });

    it("only promotes spectators while there is room", async () => {
        const { host, gameId } = await finishedRaceWithSpectator();
        await app.games.updateMeta(gameId, {
            settings: { ...(await app.games.get(gameId))!.settings, maxPlayers: 2 },
        });

        await app.gameService.rematch(host);

        expect(
            (await app.games.get(gameId))!.players.find((p) => p.nickname === "Watcher")!
                .isSpectator,
        ).toBe(true);
    });

    it("refuses a guest, and refuses before the race is over", async () => {
        const { host, guests } = await app.lobbyWith("guest");

        await expect(app.gameService.rematch(host)).rejects.toThrow(InvalidStateError);
        await expect(app.gameService.rematch(guests[0]!)).rejects.toThrow(ForbiddenError);
    });
});

describe("leaveGame", () => {
    it("deletes the room and its chat when the last player leaves", async () => {
        const { host, gameId } = await app.lobbyWith();
        await app.chatService.send(host, "s-host", "hi");

        await app.gameService.leaveGame(gameId, host.playerId);

        expect(await app.games.get(gameId)).toBeNull();
        expect(await app.chat.recent(gameId)).toEqual([]);
    });

    it("passes the host role to the next racer", async () => {
        const { host, guests, gameId } = await app.lobbyWith("guest");

        await app.gameService.leaveGame(gameId, host.playerId);

        const game = (await app.games.get(gameId))!;
        expect(game.players).toHaveLength(1);
        expect(game.players[0]).toMatchObject({ id: guests[0]!.playerId, isHost: true });
        expect(app.notifier.membersOf(gameId)).toEqual(["s-guest"]);
    });

    it("ends the race if everyone left behind has already finished", async () => {
        const { host, guests, gameId } = await app.lobbyWith("guest");
        await app.startRace(host);
        await app.typeAll(host);

        await app.gameService.leaveGame(gameId, guests[0]!.playerId);

        expect((await app.games.get(gameId))!.phase).toBe("over");
    });

    it("stops the countdown when everyone leaves", async () => {
        const { host, gameId } = await app.lobbyWith();
        await app.gameService.startRace(host);

        await app.gameService.leaveGame(gameId, host.playerId);

        expect(app.raceClock.isRunning(gameId)).toBe(false);
    });
});

describe("reattach", () => {
    it("points the player at their new socket", async () => {
        const { host, gameId } = await app.lobbyWith();

        await app.gameService.reattach(gameId, host.playerId, "new-socket");

        expect((await app.games.get(gameId))!.players[0]!.socketId).toBe("new-socket");
        expect(app.notifier.membersOf(gameId)).toContain("new-socket");
    });

    it("throws NotFoundError for a player who was removed", async () => {
        const { gameId } = await app.lobbyWith();

        await expect(app.gameService.reattach(gameId, "ghost", "s")).rejects.toThrow(NotFoundError);
    });
});
