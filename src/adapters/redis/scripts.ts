// Lua scripts for the Redis adapters. Redis runs a script as ONE step:
// no other command can run in the middle, so "check, then write" is atomic.
// That's what stops two players taking the last seat at the same time.
//
// Note: scripts build player-hash names from a prefix passed in ARGV. Redis
// Cluster would need every key in KEYS; a single Redis (ours) doesn't care.
import type { Redis } from "ioredis";

/** Refreshes the TTL of the game hash, its player list and every player hash. */
const TOUCH_ROOM = `
local function touchRoom(gameKey, playersKey, ttl, playerPrefix)
    redis.call('EXPIRE', gameKey, ttl)
    redis.call('EXPIRE', playersKey, ttl)
    for _, id in ipairs(redis.call('ZRANGE', playersKey, 0, -1)) do
        redis.call('EXPIRE', playerPrefix .. id, ttl)
    end
end
`;

/**
 * KEYS: game hash, players zset, new player's hash
 * ARGV: player id, max racers, player-hash prefix, TTL, isSpectator ("1"/"0"), field, value, ...
 * Returns "ok" | "full" | "not-found".
 */
const ADD_PLAYER = `${TOUCH_ROOM}
if redis.call('EXISTS', KEYS[1]) == 0 then return 'not-found' end
if ARGV[5] == '0' then
    local racers = 0
    for _, id in ipairs(redis.call('ZRANGE', KEYS[2], 0, -1)) do
        if redis.call('HGET', ARGV[3] .. id, 'isSpectator') == '0' then racers = racers + 1 end
    end
    if racers >= tonumber(ARGV[2]) then return 'full' end
end
local seq = redis.call('HINCRBY', KEYS[1], 'seq', 1) -- join order
redis.call('ZADD', KEYS[2], seq, ARGV[1])
for i = 6, #ARGV, 2 do redis.call('HSET', KEYS[3], ARGV[i], ARGV[i + 1]) end
touchRoom(KEYS[1], KEYS[2], ARGV[4], ARGV[3])
return 'ok'
`;

/**
 * KEYS: game hash, players zset
 * ARGV: TTL, player-hash prefix, n, then n field/value pairs to set, then fields to delete
 * Does nothing (returns 0) if the game doesn't exist, so it can't bring a deleted game back.
 */
const UPDATE_GAME = `${TOUCH_ROOM}
if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
local last = 3 + 2 * tonumber(ARGV[3])
for i = 4, last, 2 do redis.call('HSET', KEYS[1], ARGV[i], ARGV[i + 1]) end
for i = last + 1, #ARGV do redis.call('HDEL', KEYS[1], ARGV[i]) end
touchRoom(KEYS[1], KEYS[2], ARGV[1], ARGV[2])
return 1
`;

/**
 * KEYS: game hash, players zset, player hash
 * ARGV: TTL, field, value, ...
 * The hot path (one call per typed word): only touches this player's keys.
 */
const UPDATE_PLAYER = `
if redis.call('EXISTS', KEYS[1]) == 0 or redis.call('EXISTS', KEYS[3]) == 0 then return 0 end
for i = 2, #ARGV, 2 do redis.call('HSET', KEYS[3], ARGV[i], ARGV[i + 1]) end
redis.call('EXPIRE', KEYS[1], ARGV[1])
redis.call('EXPIRE', KEYS[2], ARGV[1])
redis.call('EXPIRE', KEYS[3], ARGV[1])
return 1
`;

/**
 * KEYS: sorted set   ARGV: score, member
 * Stores the score only if it beats the current one. (Real Redis has ZADD GT
 * for this; ioredis-mock doesn't, so a script keeps tests and prod identical.)
 */
const KEEP_BEST = `
local current = redis.call('ZSCORE', KEYS[1], ARGV[2])
if (not current) or tonumber(ARGV[1]) > tonumber(current) then
    redis.call('ZADD', KEYS[1], ARGV[1], ARGV[2])
    return 1
end
return 0
`;

/**
 * KEYS: sorted set   ARGV: member, expected score
 * Removes the member only if its score is still the expected one. Returns 1 to
 * exactly one caller: the race clock's "I handle this deadline" claim.
 */
const CLAIM_DUE = `
local score = redis.call('ZSCORE', KEYS[1], ARGV[1])
if score and tonumber(score) == tonumber(ARGV[2]) then
    redis.call('ZREM', KEYS[1], ARGV[1])
    return 1
end
return 0
`;

const SCRIPTS = {
    trAddPlayer: { numberOfKeys: 3, lua: ADD_PLAYER },
    trUpdateGame: { numberOfKeys: 2, lua: UPDATE_GAME },
    trUpdatePlayer: { numberOfKeys: 3, lua: UPDATE_PLAYER },
    trKeepBest: { numberOfKeys: 1, lua: KEEP_BEST },
    trClaimDue: { numberOfKeys: 1, lua: CLAIM_DUE },
} as const;

export type ScriptName = keyof typeof SCRIPTS;
type ScriptCommand = (...keysAndArgs: (string | number)[]) => Promise<unknown>;

const prepared = new WeakSet<Redis>();

/**
 * Runs one of the scripts above. `defineCommand` makes ioredis send the
 * script once and then call it by its SHA1 hash (EVALSHA), not resend it.
 */
export function runScript(
    redis: Redis,
    name: ScriptName,
    keys: readonly string[],
    args: readonly (string | number)[],
): Promise<unknown> {
    if (!prepared.has(redis)) {
        for (const [command, definition] of Object.entries(SCRIPTS)) {
            redis.defineCommand(command, definition);
        }
        prepared.add(redis);
    }
    const command = (redis as unknown as Record<string, ScriptCommand>)[name];
    if (!command) throw new Error(`Redis script ${name} is not defined`);
    return command.call(redis, ...keys, ...args);
}
