import { BaseMode } from "./ModeStrategy";
import type { Player, PlayerPatch } from "../types";

/** 🎯 A wrong word sends you back to the first word. */
export class FlawlessMode extends BaseMode {
    readonly id = "no-mistakes" as const;

    onWrongWord(player: Player): PlayerPatch {
        return { wordIndex: 0, mistakes: player.mistakes + 1 };
    }
}
