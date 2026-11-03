import type http from "node:http";
import { Server } from "socket.io";

/** The Socket.IO server with our settings, shared by index.ts and the end-to-end tests. */
export function createSocketServer(httpServer: http.Server): Server {
    return new Server(httpServer, {
        // Browsers (Flutter web) on another port/domain may connect.
        cors: { origin: "*" },
    });
}
