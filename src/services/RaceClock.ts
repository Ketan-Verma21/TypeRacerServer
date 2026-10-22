// Countdown (5..0) -> race clock (timeLimit..0) -> race over.
// Timers live in this process for now; Phase 5 replaces them with a
// Redis-driven sweeper so any server instance can run the clock.
import { COUNTDOWN_SECONDS } from "../config/constants";
import { wpmAt } from "../domain/modes/ModeStrategy";
import { racersOf } from "../domain/rules";
import { formatClock } from "../domain/time";
import type { GameId } from "../domain/types";
import type { Clock } from "../ports/Clock";
import type { GameRepository } from "../ports/GameRepository";
import type { Notifier } from "../ports/Notifier";
import type { Scheduler } from "../ports/Scheduler";

export interface RaceClockDeps {
    games: GameRepository;
    notifier: Notifier;
    clock: Clock;
    scheduler: Scheduler;
}

export class RaceClock {
    private readonly timers = new Map<GameId, () => void>(); // gameId -> stop()
    private readonly finishing = new Set<GameId>();

    constructor(private readonly deps: RaceClockDeps) {}

    isRunning(gameId: GameId): boolean {
        return this.timers.has(gameId);
    }

    /** Starts the countdown. Returns false if this game's clock is already running. */
    async start(gameId: GameId): Promise<boolean> {
        if (this.isRunning(gameId)) return false;
        const { games, notifier, scheduler } = this.deps;
        await games.updateMeta(gameId, { phase: "countdown" });

        let countDown = COUNTDOWN_SECONDS;
        const stop = scheduler.every(1000, async () => {
            if (countDown >= 0) {
                notifier.timer(gameId, { countDown, msg: "Game Starting" });
                countDown--;
                return;
            }
            stop();
            await this.beginRace(gameId);
        });
        this.timers.set(gameId, stop);
        return true;
    }

    stop(gameId: GameId): void {
        this.timers.get(gameId)?.();
        this.timers.delete(gameId);
    }

    /** Ends the race: fills in WPM for unfinished racers and tells the room. */
    async finishRace(gameId: GameId): Promise<void> {
        this.stop(gameId);
        if (this.finishing.has(gameId)) return; // already ending
        this.finishing.add(gameId);
        try {
            const { games, notifier, clock } = this.deps;
            const game = await games.get(gameId);
            if (!game || game.phase === "over") return;

            const now = clock.now();
            for (const p of racersOf(game)) {
                if (p.wpm === -1) {
                    await games.updatePlayer(gameId, p.id, { wpm: wpmAt(game, p.wordIndex, now) });
                }
            }
            await games.updateMeta(gameId, { phase: "over" });

            const over = await games.get(gameId);
            if (over) notifier.gameChanged(over);
            notifier.raceOver(gameId);
        } finally {
            this.finishing.delete(gameId);
        }
    }

    private async beginRace(gameId: GameId): Promise<void> {
        const { games, notifier, clock, scheduler } = this.deps;
        const game = await games.get(gameId);
        if (!game) {
            this.timers.delete(gameId); // everyone left during the countdown
            return;
        }
        await games.updateMeta(gameId, { phase: "racing", startTime: clock.now() });
        const racing = await games.get(gameId);
        if (racing) notifier.gameChanged(racing);

        let remaining = game.settings.timeLimit;
        const tick = async () => {
            if (remaining >= 0) {
                notifier.timer(gameId, {
                    countDown: formatClock(remaining),
                    msg: "Time Remaining",
                });
                remaining--;
            } else {
                await this.finishRace(gameId);
            }
        };
        await tick();
        if (this.timers.has(gameId)) this.timers.set(gameId, scheduler.every(1000, tick));
    }
}
