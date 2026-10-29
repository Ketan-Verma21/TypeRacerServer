import type { ModeId } from "../../config/constants";
import type { Leaderboard, LeaderboardEntry } from "../../ports/Leaderboard";

export class InMemoryLeaderboard implements Leaderboard {
    private readonly boards = new Map<ModeId, Map<string, number>>();

    async record(mode: ModeId, nickname: string, wpm: number): Promise<void> {
        const board = this.boards.get(mode) ?? new Map<string, number>();
        board.set(nickname, Math.max(wpm, board.get(nickname) ?? -Infinity));
        this.boards.set(mode, board);
    }

    async top(mode: ModeId, limit: number): Promise<LeaderboardEntry[]> {
        return [...(this.boards.get(mode) ?? new Map<string, number>())]
            .map(([nickname, wpm]) => ({ nickname, wpm }))
            .sort((a, b) => b.wpm - a.wpm)
            .slice(0, limit);
    }
}
