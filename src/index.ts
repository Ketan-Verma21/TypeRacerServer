// Entry point: HTTP server + Socket.IO, wired by the container.
import "dotenv/config";
import http from "node:http";
import { createHttpApp } from "./app";
import { loadConfig } from "./config/env";
import { buildContainer } from "./container";
import { createKafka, createProducer } from "./infra/kafka";
import { keepTrying } from "./infra/keepTrying";
import { PinoLogger } from "./infra/PinoLogger";
import { createRedisClient, isRedisReady } from "./infra/redis";
import { attachRedisAdapter } from "./infra/redisAdapter";
import { createSocketServer } from "./transport/socket/createSocketServer";
import { registerSocketHandlers } from "./transport/socket/registerSocketHandlers";
import type { IoServer } from "./transport/socket/types";

const config = loadConfig(); // throws with a readable message on bad env vars
const logger = PinoLogger.create(config);

process.on("unhandledRejection", (reason) =>
    logger.error("unhandled rejection", { reason: String(reason) }),
);

const redis = config.store === "redis" ? createRedisClient(config.redisUrl, logger) : undefined;
const isReady = redis ? () => isRedisReady(redis) : undefined;

// EVENTS=kafka: match events go to Kafka (Phase 7). Connecting never blocks
// startup, and a Kafka outage never makes the server "not ready": races don't need it.
const producer =
    config.events === "kafka"
        ? createProducer(createKafka(config.kafkaBrokers, config.instanceId))
        : undefined;
const stopConnecting = producer ? keepTrying("kafka", () => producer.connect(), logger) : () => {};

const server = http.createServer(createHttpApp({ isReady, instanceId: config.instanceId }));
const socketServer = createSocketServer(server);
// With Redis, broadcasts reach players on every server instance (Phase 5).
const closeAdapter = redis
    ? attachRedisAdapter(socketServer, redis, (err) =>
          logger.warn("redis pub/sub error", { err: err.message }),
      )
    : async () => {};
const io = socketServer as unknown as IoServer;
const container = buildContainer(config, io, logger, redis, producer);
registerSocketHandlers(io, container);

server.listen(config.port, "0.0.0.0", () => {
    logger.info("Type Racer server listening", {
        port: config.port,
        store: config.store,
        events: config.events,
        instanceId: config.instanceId,
    });
});

// `docker compose stop/restart` sends SIGTERM. Without a handler Node (PID 1 in
// the container) ignores it and Docker kills us after 10 s. Close cleanly instead.
let stopping = false;
function shutdown(signal: string): void {
    if (stopping) return;
    stopping = true;
    logger.info("shutting down", { signal });
    container.stop(); // no more sweeps from this instance; the others carry on
    stopConnecting();
    socketServer.close(); // also closes the HTTP server
    // producer.disconnect() first sends any events still waiting in its buffer.
    void Promise.allSettled([closeAdapter(), redis?.quit(), producer?.disconnect()]).finally(() =>
        process.exit(0),
    );
    setTimeout(() => process.exit(0), 3000).unref(); // don't wait forever
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
