// 6-character room codes, e.g. "K7P2QX". No 0/O or 1/I so they are easy to
// read out loud and type on a phone.
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 characters
export const ROOM_CODE_LENGTH = 6;

const ROOM_CODE_PATTERN = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

/** "  k7p2qx " -> "K7P2QX" (players may type lower case or add spaces). */
export const normalizeRoomCode = (raw: unknown): string =>
    String(raw ?? "")
        .trim()
        .toUpperCase();

export const isValidRoomCode = (code: string): boolean => ROOM_CODE_PATTERN.test(code);

/** Builds a code from a random-number source (`randomInt(n)` returns 0..n-1). */
export function generateRoomCode(randomInt: (max: number) => number): string {
    let code = "";
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
        code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
    }
    return code;
}
