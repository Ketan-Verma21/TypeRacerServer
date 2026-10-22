// The shape of every message the app may send. Anything else is rejected
// before it reaches a service. Unknown extra fields are dropped (e.g. the
// v1 app still sends `playerId` with "timer"; it is ignored).
import { z } from "zod";

const gameId = z.string().max(32);

export const Schemas = {
    createGame: z.object({ nickname: z.string().max(100) }),
    joinGame: z.object({ nickname: z.string().max(100), gameId }),
    updateSettings: z.object({ gameId, settings: z.record(z.string(), z.unknown()) }),
    startTimer: z.object({ gameId }),
    userInput: z.object({ gameId, userInput: z.string().min(1).max(100) }),
    rematch: z.object({ gameId }),
    chatMessage: z.object({ gameId, text: z.string().max(1000) }),
    chatSync: z.object({ gameId }),
    reaction: z.object({ gameId, emoji: z.string().max(16) }),
    leaveGame: z.object({ gameId }),
    rejoinGame: z.object({ gameId, playerId: z.string().max(64) }),
} as const;
