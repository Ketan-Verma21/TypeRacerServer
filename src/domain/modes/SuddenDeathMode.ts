import { BaseMode, wpmAt } from "./ModeStrategy";
import { activeRacers, isFinished, racersOf } from "../rules";
import type { Game, Player, PlayerPatch } from "../types";

/** 💀 One wrong word and you're out. First to finish, or last one standing, wins. */
export class SuddenDeathMode extends BaseMode {
    readonly id = "sudden-death" as const;

    onWrongWord(player: Player, game: Game, now: number): PlayerPatch {
        return {
            isEliminated: true,
            mistakes: player.mistakes + 1,
            wpm: wpmAt(game, player.wordIndex, now), // frozen at the moment they went out
        };
    }

    override shouldEnd(game: Game): boolean {
        const racers = racersOf(game);
        if (racers.length === 0) return false;
        const active = activeRacers(game);
        if (active.length === 0) return true; // everyone finished or out
        if (racers.some((p) => isFinished(game, p))) return true; // first to finish wins
        return racers.length >= 2 && active.length <= 1; // last one standing
    }
}
