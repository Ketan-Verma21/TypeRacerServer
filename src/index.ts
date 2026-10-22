// Entry point: HTTP server + Socket.IO, wired by the container.
import "dotenv/config";
import http from "node:http";
import socketIo from "socket.io";
import { createHttpApp } from "./app";
import { loadConfig } from "./config/env";
import { buildContainer } from "./container";
import { PinoLogger } from "./infra/PinoLogger";
import { registerSocketHandlers } from "./transport/socket/registerSocketHandlers";
import type { IoServer } from "./transport/socket/types";

const config = loadConfig(); // throws with a readable message on bad env vars
const logger = PinoLogger.create(config);

process.on("unhandledRejection", (reason) =>
    logger.error("unhandled rejection", { reason: String(reason) }),
);

const server = http.createServer(createHttpApp());
const io = socketIo(server) as unknown as IoServer;
registerSocketHandlers(io, buildContainer(config, io, logger));

server.listen(config.port, "0.0.0.0", () => {
    logger.info("Type Racer server listening", { port: config.port });
});
