// PORT: where live games are stored. Services only see this interface;
// InMemoryGameRepository (now) and RedisGameRepository (Phase 4) implement it
// and must both pass tests/contract/gameRepository.contract.ts.
import type { Game, GameId, Player, PlayerId } from "../domain/types";

export type GameMeta = Omit<Game, "id" | "players">;
export type PlayerUpdate = Partial<Omit<Player, "id">>;
export type AddPlayerResult = "ok" | "full" | "not-found";

export interface GameRepository {
    create(game: Game): Promise<void>;
    /** A copy of the game, or null. Changing the copy changes nothing. */
    get(id: GameId): Promise<Game | null>;
    exists(id: GameId): Promise<boolean>;
    /** Changes game fields. A field set to `undefined` is removed. */
    updateMeta(id: GameId, patch: Partial<GameMeta>): Promise<void>;
    /**
     * Adds a player. Racers are only added while fewer than `maxRacers` racers
     * are in the game (checked atomically); spectators are always added.
     */
    addPlayer(id: GameId, player: Player, maxRacers: number): Promise<AddPlayerResult>;
    updatePlayer(id: GameId, playerId: PlayerId, patch: PlayerUpdate): Promise<void>;
    removePlayer(id: GameId, playerId: PlayerId): Promise<void>;
    delete(id: GameId): Promise<void>;
}
