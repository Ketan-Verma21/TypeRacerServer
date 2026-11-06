// One room of bots: create, set up, join, start, race to the end.
import { Bot } from "./bot";
import type { Metrics } from "./metrics";

export interface RoomOptions {
    url: string;
    players: number;
    wordIntervalMs: number;
    timeLimit: number; // seconds
}

export async function playRoom(no: number, o: RoomOptions, metrics: Metrics): Promise<void> {
    const bots: Bot[] = [];
    try {
        const host = await Bot.connect(o.url, metrics);
        bots.push(host);
        host.socket.emit("create-game", { nickname: `R${no}-1` });
        const gameId = await host.joinedGame();
        host.socket.emit("update-settings", {
            gameId,
            settings: { length: "long", timeLimit: o.timeLimit, maxPlayers: o.players },
        });
        await host.waitUntil((g) => g.words.length >= 45, 5000); // the long quote is in

        for (let i = 2; i <= o.players; i++) {
            const guest = await Bot.connect(o.url, metrics);
            bots.push(guest);
            guest.socket.emit("join-game", { nickname: `R${no}-${i}`, gameId });
            await guest.joinedGame();
        }
        if (!(await host.waitUntil((g) => g.players.length === o.players, 10_000))) {
            throw new Error("not everyone joined");
        }

        host.socket.emit("timer", { gameId });
        // countdown (~7 s) -> racing: isJoin goes false
        if (!(await host.waitUntil((g) => !g.isJoin, 15_000))) throw new Error("race didn't start");
        metrics.roomsStarted++;

        const deadline = Date.now() + (o.timeLimit + 10) * 1000;
        await Promise.all(bots.map((b) => b.race(o.wordIntervalMs, deadline)));
        if (!(await host.waitUntil((g) => g.isOver, (o.timeLimit + 15) * 1000))) {
            throw new Error("race didn't end");
        }
        metrics.roomsFinished++;
    } catch (err) {
        metrics.roomsFailed++;
        metrics.error(`room:${err instanceof Error ? err.message : String(err)}`);
    } finally {
        for (const bot of bots) bot.close();
    }
}
