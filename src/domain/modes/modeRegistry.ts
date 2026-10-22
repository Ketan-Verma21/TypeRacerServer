import type { ModeId } from "../../config/constants";
import { ClassicMode } from "./ClassicMode";
import { FlawlessMode } from "./FlawlessMode";
import type { ModeStrategy } from "./ModeStrategy";
import { SuddenDeathMode } from "./SuddenDeathMode";

/** Looks up the strategy for a mode id. */
export class ModeRegistry {
    private readonly modes = new Map<ModeId, ModeStrategy>();

    constructor(modes: readonly ModeStrategy[]) {
        for (const m of modes) this.modes.set(m.id, m);
    }

    get(id: ModeId): ModeStrategy {
        const mode = this.modes.get(id);
        if (!mode) throw new Error(`No strategy registered for mode "${id}"`);
        return mode;
    }
}

/** The three modes the game ships with. A new mode is added here. */
export const createDefaultModeRegistry = (): ModeRegistry =>
    new ModeRegistry([new ClassicMode(), new FlawlessMode(), new SuddenDeathMode()]);
