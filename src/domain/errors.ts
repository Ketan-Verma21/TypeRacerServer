// Expected failures. Services throw these; the socket layer turns them into
// a message for the player. Anything else is a bug (logged as INTERNAL).

export type ErrorCode = "NOT_FOUND" | "FORBIDDEN" | "ROOM_FULL" | "VALIDATION" | "INVALID_STATE";

export class DomainError extends Error {
    constructor(
        readonly code: ErrorCode,
        message: string,
    ) {
        super(message);
        this.name = new.target.name;
    }
}

export class NotFoundError extends DomainError {
    constructor(message = "Please enter a valid game id") {
        super("NOT_FOUND", message);
    }
}

export class ForbiddenError extends DomainError {
    constructor(message = "Only the host can do that") {
        super("FORBIDDEN", message);
    }
}

export class RoomFullError extends DomainError {
    constructor(message = "This room is full") {
        super("ROOM_FULL", message);
    }
}

export class ValidationError extends DomainError {
    constructor(message: string) {
        super("VALIDATION", message);
    }
}

/** The action isn't possible right now (e.g. changing settings mid-race). */
export class InvalidStateError extends DomainError {
    constructor(message: string) {
        super("INVALID_STATE", message);
    }
}
