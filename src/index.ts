// Entry point: HTTP server + Socket.IO, wired by the container.
import "dotenv/config";
import http from "node:http";
import socketIo from "socket.io";
import { createHttpApp } from "./app";
import { loadConfig } from "./config/env";
import { buildContainer } from "./container";
import { PinoLogger } from "./infra/PinoLogger";
import { createRedisClient, isRedisReady } from "./infra/redis";
import { registerSocketHandlers } from "./transport/socket/registerSocketHandlers";
import type { IoServer } from "./transport/socket/types";

const config = loadConfig(); // throws with a readable message on bad env vars
const logger = PinoLogger.create(config);

process.on("unhandledRejection", (reason) =>
    logger.error("unhandled rejection", { reason: String(reason) }),
);

const redis = config.store === "redis" ? createRedisClient(config.redisUrl, logger) : undefined;
const isReady = redis ? () => isRedisReady(redis) : undefined;

const server = http.createServer(createHttpApp({ isReady }));
const socketServer = socketIo(server);
const io = socketServer as unknown as IoServer;
registerSocketHandlers(io, buildContainer(config, io, logger, redis));

server.listen(config.port, "0.0.0.0", () => {
    logger.info("Type Racer server listening", { port: config.port, store: config.store });
});

// `docker compose stop/restart` sends SIGTERM. Without a handler Node (PID 1 in
// the container) ignores it and Docker kills us after 10 s. Close cleanly instead.
let stopping = false;
function shutdown(signal: string): void {
    if (stopping) return;
    stopping = true;
    logger.info("shutting down", { signal });
    socketServer.close(); // also closes the HTTP server
    void (redis?.quit() ?? Promise.resolve()).finally(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref(); // don't wait forever
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
