// The small part of Socket.IO this server uses. Our code depends on these
// interfaces, so the Socket.IO 2 -> 4 upgrade (Phase 5) changes only adapters.

export interface Emitter {
    emit(event: string, ...args: unknown[]): unknown;
}

export interface ServerSocket extends Emitter {
    readonly id: string;
    on(event: string, listener: (data?: unknown) => void): unknown;
    join(room: string): unknown;
    leave(room: string): unknown;
}

export interface IoServer {
    to(room: string): Emitter;
    on(event: "connection", listener: (socket: ServerSocket) => void): unknown;
}
