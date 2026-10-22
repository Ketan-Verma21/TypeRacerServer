import { BaseMode } from "./ModeStrategy";
import type { PlayerPatch } from "../types";

/** 🏁 Wrong words are ignored. Fastest typist wins. */
export class ClassicMode extends BaseMode {
    readonly id = "classic" as const;

    onWrongWord(): PlayerPatch | null {
        return null;
    }
}
