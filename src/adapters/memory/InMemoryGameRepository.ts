import type { Game, GameId, Player, PlayerId } from "../../domain/types";
import type {
    AddPlayerResult,
    GameMeta,
    GameRepository,
    PlayerUpdate,
} from "../../ports/GameRepository";

/**
 * Games in a Map. Always stores and returns copies, so it behaves like a
 * real database (Redis) and no caller can change stored data by accident.
 */
export class InMemoryGameRepository implements GameRepository {
    private readonly games = new Map<GameId, Game>();

    async create(game: Game): Promise<void> {
        if (this.games.has(game.id)) throw new Error(`Game ${game.id} already exists`);
        this.games.set(game.id, structuredClone(game));
    }

    async get(id: GameId): Promise<Game | null> {
        const game = this.games.get(id);
        return game ? structuredClone(game) : null;
    }

    async exists(id: GameId): Promise<boolean> {
        return this.games.has(id);
    }

    async updateMeta(id: GameId, patch: Partial<GameMeta>): Promise<void> {
        const game = this.games.get(id);
        if (!game) return;
        for (const [key, value] of Object.entries(structuredClone(patch))) {
            // undefined = remove the field (e.g. clear startTime on rematch)
            if (value === undefined) delete (game as unknown as Record<string, unknown>)[key];
            else (game as unknown as Record<string, unknown>)[key] = value;
        }
    }

    async addPlayer(id: GameId, player: Player, maxRacers: number): Promise<AddPlayerResult> {
        const game = this.games.get(id);
        if (!game) return "not-found";
        const racers = game.players.filter((p) => !p.isSpectator).length;
        if (!player.isSpectator && racers >= maxRacers) return "full";
        game.players.push(structuredClone(player));
        return "ok";
    }

    async updatePlayer(id: GameId, playerId: PlayerId, patch: PlayerUpdate): Promise<void> {
        const player = this.games.get(id)?.players.find((p) => p.id === playerId);
        if (player) Object.assign(player, patch);
    }

    async removePlayer(id: GameId, playerId: PlayerId): Promise<void> {
        const game = this.games.get(id);
        if (game) game.players = game.players.filter((p) => p.id !== playerId);
    }

    async delete(id: GameId): Promise<void> {
        this.games.delete(id);
    }
}
