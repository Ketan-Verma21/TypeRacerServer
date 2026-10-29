import type http from "node:http";
import { Server } from "socket.io";

/** The Socket.IO server with our settings, shared by index.ts and the end-to-end tests. */
export function createSocketServer(httpServer: http.Server): Server {
    return new Server(httpServer, {
        // Browsers (Flutter web) on another port/domain may connect.
        cors: { origin: "*" },
        // TEMPORARY (Phase 5.1 -> 5.2): also accept the Socket.IO 2 protocol, so
        // the current app (socket_io_client 1.x) keeps working until it is upgraded.
        allowEIO3: true,
    });
}
