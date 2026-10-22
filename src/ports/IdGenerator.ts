export interface IdGenerator {
    gameId(): string;
    playerId(): string;
    eventId(): string; // e.g. a reaction
}
