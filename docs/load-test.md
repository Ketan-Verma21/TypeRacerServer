# Load test — Phase 6

How many players can the game serve, how fast does a typed word reach everyone,
and what happens when a server dies in the middle of a race?

**Date:** 2026-11-06 · **Setup:** Docker Compose on one laptop — Nginx → `app1..app3` → Redis.

## Summary

| Requirement      | Target                                                                       | Result                                                                                        |
| ---------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| NFR-2 capacity   | ≥ 1,000 concurrent players on 3 servers                                      | ✅ **1,000** players (125 rooms × 8), every race finished, 0 errors                           |
| NFR-3 latency    | p95 word → broadcast < 100 ms                                                | ✅ **17 ms** at 1,000 players · **77 ms** at 2,000 players on 2 servers                       |
| NFR-4 resilience | kill a server mid-race; players are back within the 15 s grace; races finish | ✅ **333 / 333** dropped players back in **< 1 s** (p95 0.96 s); **125 / 125** races finished |

One server also handles 1,000 players, but at its CPU limit; at **2,000** players
one server falls over (p95 **527 ms**, 11 of 250 rooms never start) while two
servers stay within target. That's what the extra servers buy: **headroom**.

## Method

- **Bots** (`tests/load/`): real Socket.IO connections through Nginx, WebSocket only, like the app.
  A room = 8 bots: one creates it and picks a long quote (≈ 45 words) and 60 s;
  seven join; the host starts; everyone types at **60 WPM** (≈ 1 word/s, ±30 % jitter).
- **Latency** is measured for every word: from sending it to receiving the first
  `updateGame` broadcast that shows it. It includes Nginx, the game server,
  Redis and the bot's own processing — an upper bound for the server.
- A word not confirmed within 3 s is sent again; a bot whose connection drops
  reconnects and sends `rejoin-game`, exactly like the app.
- **CPU / RAM**: `docker stats` every ~5 s during each run.
- Rooms start 40 ms apart (125 rooms ramp up in 5 s).

**Hardware:** Intel Core i7-1165G7 (4 cores / 8 threads, 2.8 GHz), 15 GiB RAM,
Ubuntu 22.04. Bots, Nginx, servers and Redis all ran on this one laptop and
competed for the same CPU, so real separate machines would do better.

## Results

| Players    | Servers | Rooms finished | Words confirmed | p50        | p95        | p99    | max      |
| ---------- | ------- | -------------- | --------------- | ---------- | ---------- | ------ | -------- |
| 40 (smoke) | 3       | 5 / 5          | 2,055           | 5 ms       | 13 ms      | 37 ms  | 61 ms    |
| 1,000      | 3       | 125 / 125      | 50,247          | 3 ms       | 17 ms      | 34 ms  | 78 ms    |
| 1,000      | 1       | 125 / 125      | 50,135          | 4 ms       | 16 ms      | 33 ms  | 64 ms    |
| 2,000      | 2       | 250 / 250      | 99,867          | 19 ms      | 77 ms      | 106 ms | 370 ms   |
| 2,000      | 1       | **239 / 250**  | 91,895          | **261 ms** | **527 ms** | 860 ms | 1,200 ms |

_Throughput: ~1,000 words/s at 1,000 players, ~2,000 words/s at 2,000; every word is broadcast to the 8 players of its room._

### CPU and memory during the race

| Run                       | Each game server                                   | Nginx   | Redis            |
| ------------------------- | -------------------------------------------------- | ------- | ---------------- |
| 1,000 players · 3 servers | **55–80 % CPU** (peaks 97 %) · 100–128 MiB         | 30–40 % | 25–46 % · 18 MiB |
| 1,000 players · 1 server  | **100–124 % CPU** for the whole race · 155–175 MiB | ~26 %   | ~22 % · 19 MiB   |
| 2,000 players · 2 servers | 108–121 % CPU                                      | 45–50 % | 41–46 %          |
| 2,000 players · 1 server  | 107–134 % CPU                                      | ~30 %   | ~25 %            |

A Node.js server runs its JavaScript on one main thread, so ~100 % (one core)
is its practical ceiling; readings above 100 % include garbage collection and
I/O threads. **One server at 1,000 players sits at that ceiling** — latency is
still fine, but there is no room left. At 2,000 players the single server is
past it and every message waits in line (p50 19 ms → 261 ms, ×14).

Redis is never the bottleneck: under 50 % of a core and under 20 MiB of memory at 2,000 players.

### Killing a server mid-race (NFR-4)

1,000 players on 3 servers; `docker compose stop app2` ≈ 20 s into the race.

|                                            |                                                                      |
| ------------------------------------------ | -------------------------------------------------------------------- |
| Players disconnected                       | 333 (app2's third)                                                   |
| Reconnected and back in their race         | **333 / 333**                                                        |
| Time to be back (drop → `joined`)          | p50 **0.65 s** · p95 **0.96 s** · max 0.99 s                         |
| Races finished                             | **125 / 125**, 0 errors                                              |
| Words sent again (unconfirmed at the drop) | 223                                                                  |
| Word latency                               | p50 2 ms · p95 21 ms · p99 170 ms (the spike is the failover second) |

The race clock, the rooms and the 15 s grace periods all live in Redis, so
app1 and app3 simply carried on — the players on app2 only noticed a ~0.6 s
pause. After the kill, app1 and app3 took the extra load at 57–101 % CPU.

## Bug found by the load test

The first 1-server run finished only **67 of 125 rooms**: 58 failed with a
connect `timeout` while app1 sat at ~50 % CPU. Cause: Nginx still sent some new
connections to the stopped `app2`/`app3`. A stopped container's address doesn't
answer at all, Nginx's default `proxy_connect_timeout` is **60 s**, and the
client gives up after 10 s — so Nginx never counted enough failures to take
those servers out. Fix (`nginx/nginx.conf`): `proxy_connect_timeout 2s` plus
`proxy_next_upstream error timeout` (try the next server, up to 3 times). Rerun:
**125 / 125**. The same fix is what lets reconnecting players find a live
server quickly after a crash.

## Limits of this test

- Everything ran on one laptop; the bots used CPU that the servers would otherwise have.
- Bots type at a steady 60 WPM; real players are burstier.
- The "2,000 players" comparison is 2 servers vs 1 (app2 was still stopped from
  the kill test). A 3-server run at 2,000 would only have more headroom.

## Reproduce

```bash
docker compose up --build -d
ulimit -n 8192                        # 1,000+ sockets from one process
npm run load -- --rooms 5             # smoke test
npm run load -- --rooms 125           # 1,000 players
docker compose stop app2              # during a run: the kill test
# CPU/RAM log in another terminal:
while true; do docker stats --no-stream --format "$(date +%T),{{.Name}},{{.CPUPerc}},{{.MemUsage}}"; sleep 3; done
```

Each run prints a summary and saves the full numbers as JSON in `load-results/`.
