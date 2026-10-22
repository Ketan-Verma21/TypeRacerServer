// Strategy pattern: each game mode is its own class with the same shape.
// Adding a mode = adding a class (Open/Closed), no `if (mode === ...)` anywhere.
import type { ModeId } from "../../config/constants";
import { activeRacers, racersOf } from "../rules";
import { calculateWpm } from "../time";
import type { Game, Player, PlayerPatch } from "../types";

export interface ModeStrategy {
    readonly id: ModeId;
    /** The player typed the right word. */
    onCorrectWord(player: Player, game: Game, now: number): PlayerPatch;
    /** The player typed a wrong word. `null` = ignore it. */
    onWrongWord(player: Player, game: Game, now: number): PlayerPatch | null;
    /** Should the race end right now? */
    shouldEnd(game: Game): boolean;
}

/** WPM for `words` completed words at time `now`. */
export const wpmAt = (game: Game, words: number, now: number): number =>
    game.startTime === undefined ? 0 : calculateWpm(words, now - game.startTime);

/** Shared behaviour; modes override only what differs. */
export abstract class BaseMode implements ModeStrategy {
    abstract readonly id: ModeId;
    abstract onWrongWord(player: Player, game: Game, now: number): PlayerPatch | null;

    onCorrectWord(player: Player, game: Game, now: number): PlayerPatch {
        const wordIndex = player.wordIndex + 1;
        const finished = wordIndex >= game.words.length;
        return finished ? { wordIndex, wpm: wpmAt(game, wordIndex, now) } : { wordIndex };
    }

    /** Default: over when every racer has finished or is out. */
    shouldEnd(game: Game): boolean {
        return racersOf(game).length > 0 && activeRacers(game).length === 0;
    }
}
