import { createAdapter } from "@socket.io/redis-adapter";
import type { Redis } from "ioredis";
import type { Server } from "socket.io";

/**
 * Socket.IO Redis adapter: when one server instance broadcasts to a room, the
 * message is published on Redis and every other instance delivers it to its
 * own sockets in that room. Room joins by socket id (`socketsJoin`) travel the
 * same way, so they work whichever instance the socket is connected to.
 *
 * Needs two extra connections: a subscribed connection can't run normal commands.
 * Returns a function that closes them.
 */
export function attachRedisAdapter(
    io: Server,
    redis: Redis,
    onError: (err: Error) => void,
    key = "socket.io",
): () => Promise<void> {
    const pub = redis.duplicate();
    const sub = redis.duplicate();
    for (const client of [pub, sub]) client.on("error", onError);
    io.adapter(createAdapter(pub, sub, { key }));
    return async () => {
        await Promise.allSettled([pub.quit(), sub.quit()]);
    };
}
