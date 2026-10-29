import type { MatchSummary } from "../../domain/events";
import type { GameId } from "../../domain/types";
import type { MatchHistory } from "../../ports/MatchHistory";

export class InMemoryMatchHistory implements MatchHistory {
    private readonly all: MatchSummary[] = [];
    private readonly byGame = new Map<GameId, MatchSummary[]>();

    constructor(
        private readonly maxRecent = 500,
        private readonly maxPerGame = 20,
    ) {}

    async add(match: MatchSummary): Promise<void> {
        this.all.unshift(structuredClone(match));
        this.all.splice(this.maxRecent);
        const games = this.byGame.get(match.gameId) ?? [];
        games.unshift(structuredClone(match));
        games.splice(this.maxPerGame);
        this.byGame.set(match.gameId, games);
    }

    async recent(limit: number): Promise<MatchSummary[]> {
        return structuredClone(this.all.slice(0, limit));
    }

    async forGame(gameId: GameId): Promise<MatchSummary[]> {
        return structuredClone(this.byGame.get(gameId) ?? []);
    }
}
