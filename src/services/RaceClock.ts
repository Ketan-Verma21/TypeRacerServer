// Countdown (5..0) -> race clock (timeLimit..0) -> race over.
//
// Nothing here keeps time in memory. A running game is one entry in the
// RaceSchedule (game -> deadline, in Redis with STORE=redis), and every server
// instance calls sweep() once a second (Sweeper). Claims make sure each tick is
// sent once and each phase change happens once, whichever instance does it —
// so a race keeps going if the server that started it dies or restarts.
import { COUNTDOWN_SECONDS } from "../config/constants";
import { matchFinished } from "../domain/events";
import { wpmAt } from "../domain/modes/ModeStrategy";
import { racersOf } from "../domain/rules";
import { formatClock } from "../domain/time";
import type { GameId } from "../domain/types";
import type { Clock } from "../ports/Clock";
import type { EventPublisher } from "../ports/EventPublisher";
import type { GameRepository } from "../ports/GameRepository";
import type { Notifier } from "../ports/Notifier";
import type { RaceSchedule } from "../ports/RaceSchedule";

export interface RaceClockDeps {
    games: GameRepository;
    notifier: Notifier;
    clock: Clock;
    schedule: RaceSchedule;
    events: EventPublisher;
    /** One game failing must not stop the clock for the others. */
    onError: (err: unknown, gameId: GameId) => void;
}

/**
 * Times are whole seconds, so every instance agrees on "which second is it"
 * even though timers fire a few ms late (or instances differ slightly).
 * A phase that shows N .. 0, one number per second, ends one second after the
 * 0 — its deadline is (N + 1) s after the second that showed N.
 */
const wholeSecond = (ms: number): number => Math.round(ms / 1000) * 1000;
const nextWholeSecond = (ms: number): number => Math.floor(ms / 1000) * 1000 + 1000;
/** The countdown shows 5 at the first full second after Start. */
const countdownDeadline = (now: number): number =>
    nextWholeSecond(now) + (COUNTDOWN_SECONDS + 1) * 1000;
/** The race shows the full time in the second it begins. */
const raceDeadline = (second: number, timeLimit: number): number => second + (timeLimit + 1) * 1000;
/** The number to show in `second` for a phase ending at `deadline` (-1 = nothing). */
const shownAt = (deadline: number, second: number): number => (deadline - second) / 1000 - 1;

export class RaceClock {
    constructor(private readonly deps: RaceClockDeps) {}

    async isRunning(gameId: GameId): Promise<boolean> {
        return (await this.deps.schedule.deadlineOf(gameId)) !== null;
    }

    /** Starts the countdown. false if this game's clock is already running (on any instance). */
    async start(gameId: GameId): Promise<boolean> {
        const { games, schedule, clock } = this.deps;
        if (!(await schedule.add(gameId, countdownDeadline(clock.now())))) return false;
        await games.updateMeta(gameId, { phase: "countdown" });
        return true;
    }

    async stop(gameId: GameId): Promise<void> {
        await this.deps.schedule.remove(gameId);
    }

    /** Once a second, on every instance: send this second's ticks, handle deadlines. */
    async sweep(now: number): Promise<void> {
        const { schedule, onError } = this.deps;
        const second = wholeSecond(now);
        for (const { gameId, deadline } of await schedule.all()) {
            try {
                await this.tick(gameId, deadline, second);
                if (deadline <= second && (await schedule.claim(gameId, deadline))) {
                    await this.onDeadline(gameId, second);
                }
            } catch (err) {
                onError(err, gameId);
            }
        }
    }

    /** The race is over early (everyone finished or left). */
    async finishRace(gameId: GameId): Promise<void> {
        // If the claim fails, another instance (or the sweeper) is already ending it.
        if (!(await this.deps.schedule.claim(gameId))) return;
        await this.endRace(gameId, this.deps.clock.now());
    }

    private async tick(gameId: GameId, deadline: number, second: number): Promise<void> {
        const { schedule, games, notifier } = this.deps;
        const shown = shownAt(deadline, second);
        if (shown < 0) return;
        if (!(await schedule.claimTick(gameId, `${deadline}:${shown}`))) return; // sent by another instance
        const game = await games.get(gameId);
        if (!game) {
            await schedule.remove(gameId); // the room is gone
            return;
        }
        if (game.phase === "countdown") {
            notifier.timer(gameId, { countDown: shown, msg: "Game Starting" });
        } else if (game.phase === "racing") {
            notifier.timer(gameId, { countDown: formatClock(shown), msg: "Time Remaining" });
        }
    }

    /** This instance claimed the deadline: move the game to its next phase. */
    private async onDeadline(gameId: GameId, second: number): Promise<void> {
        const game = await this.deps.games.get(gameId);
        if (game?.phase === "countdown")
            await this.beginRace(gameId, game.settings.timeLimit, second);
        else if (game?.phase === "racing") await this.endRace(gameId, second);
    }

    private async beginRace(gameId: GameId, timeLimit: number, second: number): Promise<void> {
        const { games, notifier, schedule } = this.deps;
        await games.updateMeta(gameId, { phase: "racing", startTime: second });
        const deadline = raceDeadline(second, timeLimit);
        await schedule.add(gameId, deadline);
        const racing = await games.get(gameId);
        if (racing) notifier.gameChanged(racing);
        await this.tick(gameId, deadline, second); // show the full time right away
    }

    /** Fills in WPM for unfinished racers and tells the room. */
    private async endRace(gameId: GameId, now: number): Promise<void> {
        const { games, notifier, events } = this.deps;
        const game = await games.get(gameId);
        if (!game || game.phase !== "racing") return;

        for (const p of racersOf(game)) {
            if (p.wpm === -1) {
                await games.updatePlayer(gameId, p.id, { wpm: wpmAt(game, p.wordIndex, now) });
            }
        }
        await games.updateMeta(gameId, { phase: "over" });

        const over = await games.get(gameId);
        if (over) notifier.gameChanged(over);
        notifier.raceOver(gameId);
        // Stats after the players are told. Fire and forget: never delays or breaks the race.
        if (over) void events.publish(matchFinished(over, now));
    }
}
