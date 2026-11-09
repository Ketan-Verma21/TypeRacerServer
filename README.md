# 🏎️ Type Racer — Server

[![CI](https://github.com/Ketan-Verma21/TypeRacerServer/actions/workflows/ci.yml/badge.svg)](https://github.com/Ketan-Verma21/TypeRacerServer/actions/workflows/ci.yml)

The real-time game server for **Type Racer**, a multiplayer typing race: a host creates a room, friends join with a 6-character code, and everyone types the same quote at the same time.

The server is **authoritative**. Players only send the words they type; the server checks every word, runs the clock, works out WPM and rankings, and sends everyone the same game state. A player can't fake a score, because the score is never theirs to send.

> The Flutter app lives in [Ketan-Verma21/Type_Racer](https://github.com/Ketan-Verma21/Type_Racer).

---

## ✨ What it does

- **Rooms** with 6-character codes (`ABC234` — no look-alike `0/O/1/I`), up to 8 racers, spectators for anyone who joins mid-race
- **3 game modes**: Classic, Flawless (a wrong word sends you back to the start), Sudden Death (a wrong word knocks you out)
- **Server-run clock**: 5-second countdown, then a 30–120 s race
- **Rematch**, **lobby chat** (rate-limited) and **emoji reactions**
- **Reconnects**: a dropped player has 15 s to come back and keeps their place
- **Leaderboard** (best WPM per player, per mode) and **match history**
- **Health checks** for Docker and load balancers

## 🧱 Tech stack

|                   |                                                       |
| ----------------- | ----------------------------------------------------- |
| Language          | **TypeScript** (strict) on Node.js 20                 |
| Real time         | **Socket.IO** (WebSockets)                            |
| Data              | **Redis** — or an in-memory store for development     |
| Events            | **Kafka** (KRaft) — `match.started`, `match.finished` |
| Validation / logs | zod · pino (JSON logs)                                |
| Tests             | Vitest + ioredis-mock, plus a real Redis in Docker    |
| Run               | Docker + Docker Compose                               |

---

## 🚀 Run it

### With Docker (recommended)

Starts **Nginx** on port **8080** in front of **three game servers** (`app1`, `app2`, `app3`), plus Redis, Kafka and a **stats worker**:

```bash
cp .env.example .env              # first time only
docker compose up --build -d
docker compose ps                 # every service up; kafka-init "exited (0)" after creating the topics
curl localhost:8080/health        # {"ok":true,"db":true,...}
docker compose logs -f app1 app2 app3
```

Stop it with `docker compose down` (Redis data is kept in a volume).

```
players ──► Nginx :8080 ──► app1 ┐
              (least_conn)  app2 ├──► Redis (games, race clock, pub/sub, stats)
                            app3 ┘           ▲
                              │              │ leaderboard, match history
                              ▼              │
                            Kafka ───► stats-worker
              (match.started, match.finished)
```

The game servers only **send** an event when a race starts or ends. The stats worker reads them and updates the leaderboard and match history, so a slow stats write can never slow a race down.

Nginx gives each new connection to the least busy server. Run `curl localhost:8080/health/live` a few times to see different servers answer.

#### Try it

```bash
flutter run -d chrome --dart-define=SERVER_URL=http://localhost:8080
```

Open two tabs, create a room in one and join from the other — the two players are usually on different servers. In the middle of a race, run `docker compose stop app2`: anyone who was on app2 reconnects through Nginx to another server within a few seconds and keeps racing, because the game, the clock and the 15 s reconnect window all live in Redis.

### With Node (for development)

```bash
npm ci
npm run dev        # restarts on every change; uses the in-memory store
npm run dev:worker # the stats worker (needs STORE=redis and EVENTS=kafka)
```

Then run the app against it:

```bash
flutter run -d chrome --dart-define=SERVER_URL=http://localhost:3000
```

### Settings (`.env`)

| Variable        | Default                  | What it does                                                                               |
| --------------- | ------------------------ | ------------------------------------------------------------------------------------------ |
| `PORT`          | `3000`                   | HTTP + WebSocket port                                                                      |
| `STORE`         | `memory`                 | `memory` (one server, nothing saved) or `redis`                                            |
| `REDIS_URL`     | `redis://localhost:6379` | Used when `STORE=redis`                                                                    |
| `EVENTS`        | `inprocess`              | Where match events go: `inprocess` (this server updates stats) or `kafka`                  |
| `KAFKA_BROKERS` | `localhost:9094`         | Kafka address(es), comma-separated. Used when `EVENTS=kafka`                               |
| `INSTANCE_ID`   | `app1`                   | Name of this server in the logs                                                            |
| `LOG_LEVEL`     | `info`                   | `debug`, `info`, `warn`, `error`…                                                          |
| `API_KEY`       | _(empty)_                | [API Ninjas](https://api-ninjas.com/) key for fresh quotes. Empty = the 108 bundled quotes |
| `API_URL`       | API Ninjas quotes URL    | Quote API address                                                                          |

A wrong value (for example `STORE=mongo`) stops the server at startup with a clear message.

---

## 🗺️ How it works

```
 Flutter app ──WebSocket──►  transport/socket   validate the message (zod), find the player's session
                                   │
                                   ▼
                              services/          game rules: GameService, RaceClock, ChatService, StatsService
                                   │  only talks to interfaces ("ports")
                                   ▼
                              ports/             GameRepository, Notifier, Leaderboard, Clock, ...
                                   │  implemented by
                                   ▼
                              adapters/          memory/ · redis/ · kafka/ · socket/ · quotes/ · events/
```

The code follows **SOLID** with a "ports and adapters" layout:

- **Game modes are classes** (`domain/modes/`). Adding a mode means adding a class — no `if (mode === ...)` anywhere else.
- **Services only know interfaces.** `container.ts` is the one file that picks real classes, so switching from memory to Redis (`STORE=redis`) or sending events through Kafka (`EVENTS=kafka`) is one setting and zero changes to game logic.
- **`domain/` is pure** — no I/O, no clock, no randomness — so the rules are easy to test.

```
src/
├── index.ts          start the server
├── worker.ts         start the stats worker (Kafka → StatsService → Redis)
├── container.ts      wires everything together (the only place that picks concrete classes)
├── config/           settings and game limits
├── domain/           pure game rules, modes, events
├── ports/            interfaces the services depend on
├── services/         GameService, RaceClock, ChatService, PresenceService, QuoteService, StatsService
├── adapters/         memory/, redis/, kafka/, socket/, quotes/, events/
├── transport/        HTTP health routes and Socket.IO handlers
└── infra/            Redis and Kafka clients, logger
tests/
├── unit/             rules, services, adapters, handlers
├── contract/         one test suite per interface — every adapter must pass it
├── integration/      real Socket.IO clients, real Redis
└── bench/            Redis latency benchmark
```

### Data in Redis

| Key                       | Type       | Holds                                         |
| ------------------------- | ---------- | --------------------------------------------- |
| `game:{code}`             | hash       | phase, words, settings, round, start time     |
| `game:{code}:players`     | sorted set | player ids in join order                      |
| `game:{code}:player:{id}` | hash       | one player's progress (word index, WPM, …)    |
| `game:{code}:chat`        | list       | last 30 chat messages                         |
| `socket:{id}`             | hash       | which room and player a connection belongs to |
| `leaderboard:{mode}`      | sorted set | nickname → best WPM                           |
| `matches:recent`          | list       | last 500 finished races                       |

With several servers, the **Socket.IO Redis adapter** passes messages between them over Redis pub/sub: when one server sends a room update, players connected to any server receive it.

The **race clock lives in Redis too**: a running game is one entry in the `games:clock` sorted set (game → its next deadline). Every server checks it once a second, on the second, and claims work with single Redis commands — `SET NX` for "who sends this second's tick", a small Lua script for "who starts / ends this race". So each tick is sent once, each race starts and ends once, and **a race keeps going even if the server that started it crashes**. The 15-second reconnect window works the same way (`presence:grace`), so a player can drop off one server and come back on another.

Every room key expires **2 hours** after the room's last activity. Changes that must not be interrupted run as **Lua scripts**, which Redis runs as one step — for example "count the racers and add a player only if there's a seat", so two people can never both take the last seat.

---

## 📈 Performance

Load-tested with bots that play real races through Nginx (details: [docs/load-test.md](docs/load-test.md)), all on one laptop (i7-1165G7):

| Players | Servers | Races finished | Word → everyone (p95)             |
| ------- | ------- | -------------- | --------------------------------- |
| 1,000   | 3       | 125 / 125      | **17 ms**                         |
| 2,000   | 2       | 250 / 250      | **77 ms**                         |
| 2,000   | 1       | 239 / 250      | 527 ms — one server is overloaded |

**Killing a server mid-race:** all 333 of its players reconnected to the other servers in under a second (p95 0.96 s), and all 125 races finished.

### Kafka experiments

Details: [docs/kafka.md](docs/kafka.md).

| What we did                            | What happened                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------- |
| Stopped the stats worker, ran 20 races | All 20 finished; 40 events waited in Kafka; the restarted worker counted all 20 |
| Ran two stats workers                  | Kafka gave each one 2 of the 4 partitions, no code change                       |
| Wiped the stats in Redis               | Replayed every event from Kafka: match count back to exactly 42                 |
| Stopped Kafka for 30 s during 10 races | All 10 finished (p95 7 ms); all 10 counted once Kafka was back                  |

Every event has an `eventId`, and the worker commits its Kafka offset only after Redis has the result, so a crash or a replay never counts a race twice.

---

## 🔌 Socket events

**App → server**

| Event                                     | Payload                           |                                                      |
| ----------------------------------------- | --------------------------------- | ---------------------------------------------------- |
| `create-game`                             | `{nickname}`                      | create a room                                        |
| `join-game`                               | `{nickname, gameId}`              | join a room (as a spectator if the race has started) |
| `update-settings`                         | `{gameId, settings}`              | host: mode, time, quote length, max players          |
| `timer`                                   | `{gameId}`                        | host: start the countdown                            |
| `userInput`                               | `{gameId, userInput}`             | a typed word                                         |
| `rematch`                                 | `{gameId}`                        | host: play again                                     |
| `chat-message` · `chat-sync` · `reaction` | `{gameId, ...}`                   | lobby chat and emoji                                 |
| `leave-game` · `rejoin-game`              | `{gameId}` · `{gameId, playerId}` | leave, or come back after a reconnect                |
| `get-leaderboard`                         | `{mode}`                          | top 10 for a mode                                    |

**Server → app**

| Event                                        | Payload              |                                              |
| -------------------------------------------- | -------------------- | -------------------------------------------- |
| `updateGame`                                 | full game state      | sent to the room after every change          |
| `timer`                                      | `{countDown, msg}`   | countdown and time remaining, every second   |
| `joined`                                     | `{gameId, playerId}` | who this connection is                       |
| `done`                                       | —                    | you finished / the race is over              |
| `error-message`                              | `{code, message}`    | e.g. `ROOM_FULL`, `FORBIDDEN`, `BAD_REQUEST` |
| `chat-message` · `chat-history` · `reaction` |                      | lobby chat and emoji                         |
| `leaderboard`                                | `{mode, entries}`    | answer to `get-leaderboard`                  |

HTTP: `GET /health` (used by the app to wake the server), `/health/live` (process is up), `/health/ready` (`503` if Redis is down).

---

## 🧪 Tests

```bash
npm test               # unit, contract and end-to-end tests — no Docker needed
npm run typecheck
npm run lint
npm run load -- --rooms 5   # load test against the running Docker stack (see docs/load-test.md)
```

- **Contract tests**: each interface (games, chat, sessions, rate limiting, leaderboard, history) has one shared test suite, and **both** the in-memory and the Redis versions must pass it. That's how we know the switch to Redis changed nothing.
- **Real Redis**: with `docker compose up -d redis` running:

```bash
REDIS_TEST_URL=redis://localhost:6379/15 npm run test:redis     # same suites on real Redis + two servers sharing it
REDIS_TEST_URL=redis://localhost:6379/15 npm run bench:redis    # latency benchmark
```

(These use Redis database 15 and wipe it; database 0, where games live, is refused.)

**CI** ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs all of this on every push and pull request: `format:check` → `typecheck` → `lint` → `test:coverage` → the real-Redis suites (Redis as a service container) → `build`, then checks that the Docker image builds.

Measured on a laptop with Redis in Docker — store time for one action:

| Action      | p50     | p95     | p99     |
| ----------- | ------- | ------- | ------- |
| Join a room | 0.43 ms | 0.69 ms | 1.08 ms |
| Type a word | 0.39 ms | 0.64 ms | 0.97 ms |

---

## ☁️ Deploy

Production runs on **Render**: one game server (free web service, Node 20) plus **Render Key Value** (Redis) in the same region, with Kafka off (`EVENTS=inprocess`). Settings, environment variables and checks: [docs/deploy.md](docs/deploy.md).

---

## 🛣️ Roadmap

|     |                                                                                            |
| --- | ------------------------------------------------------------------------------------------ |
| ✅  | TypeScript rewrite with SOLID, validation, structured logs, 6-char room codes              |
| ✅  | Docker Compose; Redis as the datastore; leaderboard and match history                      |
| ✅  | **Several servers at once**: Socket.IO 4, Redis adapter, a race clock shared through Redis |
| ✅  | Nginx load balancer + load testing (1,000+ players, a server killed mid-race)              |
| ✅  | Kafka for post-race events: a stats worker, replay, anti-cheat flags                       |
| ✅  | CI with GitHub Actions: format, types, lint, tests (+ real Redis), Docker build            |

## 📬 Contact

Ketan Verma — [GitHub](https://github.com/Ketan-Verma21)
