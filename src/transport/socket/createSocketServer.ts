import type http from "node:http";
import { Server } from "socket.io";

/** The Socket.IO server with our settings, shared by index.ts and the end-to-end tests. */
export function createSocketServer(httpServer: http.Server): Server {
    return new Server(httpServer, {
        // Browsers (Flutter web) on another port/domain may connect.
        cors: { origin: "*" },
        // WebSocket only, no HTTP long-polling fallback. Long-polling needs every
        // request of a connection to reach the SAME server (sticky sessions);
        // a WebSocket is one connection, so Nginx can balance freely (least_conn).
        // The app already connects with transports: ['websocket'].
        transports: ["websocket"],
    });
}
