# Deploy — Render (Phase 9)

Production is one game server on a **Render free web service** with a
**Render Key Value** (Redis) next to it. Kafka is off in production
(`EVENTS=inprocess`): the server updates the stats itself, the same code
the stats worker runs locally.

```
Flutter web app ──► Render web service (typ-racer-server) ──► Render Key Value
   (Vercel)           Node 20, 1 instance, Singapore            Redis, same region
```

## Key Value (Redis)

Dashboard → **New → Key Value**

| Setting          | Value                                                                              |
| ---------------- | ---------------------------------------------------------------------------------- |
| Name             | `type-racer-kv`                                                                    |
| Region           | **the same region as the web service** (internal URLs only work inside one region) |
| Plan             | Free (25 MB — far more than live rooms need)                                       |
| Maxmemory policy | `noeviction` — a full Redis must refuse writes, never silently drop a live room    |

Copy its **Internal Key Value URL** (`redis://red-…:6379`).

## Web service

The existing v1 service, `typ-racer-server`, keeps its URL. Its settings:

| Setting             | Value                                      | Why                                                                                      |
| ------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Repository / branch | `TypeRacerServer` / `master`               |                                                                                          |
| Runtime             | Node                                       |                                                                                          |
| Build command       | `npm ci --ignore-scripts && npm run build` | `--ignore-scripts` skips the native Kafka client: production never loads it (see below)  |
| Start command       | `node dist/index.js`                       |                                                                                          |
| Health check path   | `/health/ready`                            | answers 503 until Redis is connected, so a deploy only goes live once it can serve games |

Environment variables:

| Name           | Value                                                              |
| -------------- | ------------------------------------------------------------------ |
| `NODE_VERSION` | `20`                                                               |
| `STORE`        | `redis`                                                            |
| `REDIS_URL`    | the Key Value's internal URL                                       |
| `EVENTS`       | `inprocess`                                                        |
| `INSTANCE_ID`  | `render`                                                           |
| `LOG_LEVEL`    | `info`                                                             |
| `API_KEY`      | API Ninjas key (optional — without it the bundled quotes are used) |

`PORT` is set by Render; the server reads it. Remove the old v1 MongoDB
variable — v2 doesn't use MongoDB.

**Why the Kafka client can be skipped:** `src/index.ts` imports
`infra/kafka.ts` (the only file that loads the native client) only when
`EVENTS=kafka`. With `EVENTS=inprocess` it is never loaded, so the build
doesn't need to download or compile it.

## Check it

```bash
curl https://typ-racer-server.onrender.com/health        # {"ok":true,"db":true,...}
curl https://typ-racer-server.onrender.com/health/ready  # 200 once Redis is connected
curl https://typ-racer-server.onrender.com/health/live   # {"ok":true,"instance":"render"}
```

The free plan sleeps after 15 minutes without traffic; the first request
then takes about a minute. The app shows "Waking up the server…" meanwhile.
Rooms live in Redis, so a restart or a new deploy doesn't lose them
(the race clock resumes from Redis, Phase 5).

## Point the app at it

The web build takes the URL at build time:

```bash
flutter build web --release --dart-define=SERVER_URL=https://typ-racer-server.onrender.com
```

In Codemagic: add `--dart-define=SERVER_URL=https://typ-racer-server.onrender.com`
to the web build arguments (step 9.3).
