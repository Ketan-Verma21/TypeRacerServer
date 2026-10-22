// Socket event names in one place (must match the Flutter app).
export const ClientEvents = {
    createGame: "create-game",
    joinGame: "join-game",
    updateSettings: "update-settings",
    startTimer: "timer",
    userInput: "userInput",
    rematch: "rematch",
    chatMessage: "chat-message",
    chatSync: "chat-sync",
    reaction: "reaction",
    leaveGame: "leave-game",
    rejoinGame: "rejoin-game",
} as const;

export const ServerEvents = {
    updateGame: "updateGame",
    timer: "timer",
    done: "done",
    notCorrectGame: "notCorrectGame",
    chatMessage: "chat-message",
    chatHistory: "chat-history",
    reaction: "reaction",
} as const;
