/** v1 game ids are 24 hex characters (Phase 2 replaces them with 6-character room codes). */
export const isValidGameId = (id: unknown): id is string =>
    typeof id === "string" && /^[0-9a-fA-F]{24}$/.test(id);
