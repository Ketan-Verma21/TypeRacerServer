# Kafka — Phase 7

Why do the game servers send match events to Kafka instead of updating the
stats themselves, and what does that buy? Four experiments on the running
Docker stack.

**Date:** 2026-11-09 · **Setup:** Docker Compose on one laptop — Nginx → `app1..app3` → Redis,
plus one Kafka broker (KRaft) and the `stats-worker`. Races come from the load-test bots
(`npm run load`, 8 bots per room, 60 WPM).

## Summary

| Question                                               | Result                                                                                              |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Worker down: do races still work? Are events lost?     | ✅ **20 / 20** races finished; **40** events waited in Kafka; on restart the count went **22 → 42** |
| Two workers: does Kafka share the work?                | ✅ each worker got **2 of the 4** partitions, automatically                                         |
| Stats wiped: can they be rebuilt from Kafka?           | ✅ match count rebuilt exactly (**42 → 0 → 42**) by replaying every event                           |
| Kafka down for 30 s during races: does anything break? | ✅ **10 / 10** races finished, p95 **7 ms**; match count **42 → 52**, nothing missing               |

The main point: **stats are no longer on the race's path.** The worker or
Kafka can stop, and players don't notice; the stats catch up afterwards.

## How it works

```
game servers ──► Kafka topics ──► stats-worker ──► Redis
  (app1..3)      match.started       (group           leaderboard, match
                 match.finished       stats-worker)    history, match counts
```

- **Topics:** one per event type, 2 partitions each. The message key is the
  room code, so all events of one room land on the same partition, in order.
- **Producer** (game servers): idempotent, `acks=all`. Sending is fire-and-forget,
  so a slow or missing Kafka never delays a race; a failed send is logged.
- **Consumer** (`src/worker.ts`): group `stats-worker`, auto-commit **off**.
  The offset is committed only **after** the Redis writes succeed.
- **Effectively once:** if the worker dies between the write and the commit,
  Kafka delivers the event again. Every event carries an `eventId`, and
  StatsService records it with `SET stats:done:{eventId} NX` (kept 24 h), so the
  second copy is skipped. At-least-once delivery + dedup = every race counted once.
- **Anti-cheat:** a result above 250 WPM is flagged and kept off the leaderboard.

## Experiments

Setup used in every experiment:

```bash
lag()     { docker compose exec kafka /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group stats-worker; }
matches() { docker compose exec redis redis-cli HGET stats:matches classic; }   # match.started events handled
top5()    { docker compose exec redis redis-cli ZREVRANGE leaderboard:classic 0 4 WITHSCORES; }
caughtup(){ until lag | awk '$1=="stats-worker" && $6!="0" && $6!="-"{f=1} END{exit f}'; do sleep 0.5; done; }
```

### 1. Worker down → races go on → worker catches up

```bash
docker compose stop stats-worker
npm run load -- --rooms 20 --time 30
lag
docker compose start stats-worker; caughtup
```

- All **20 / 20** races finished with the worker stopped (p95 word → broadcast 33 ms).
- `lag` showed **20** events waiting on each topic (9 + 11 over the 2 partitions):
  Kafka kept them.
- After `start`, the worker was caught up in **20 s**. That's mostly the container
  starting and joining the group; handling 40 events takes well under a second.
- Match count **22 → 42**: exactly the 20 new races.

### 2. Two workers share the partitions

```bash
docker compose up -d --scale stats-worker=2
lag
```

| Topic          | Partition | Worker           |
| -------------- | --------- | ---------------- |
| match.finished | 0         | `…-7f6562b8` (A) |
| match.started  | 0         | `…-7f6562b8` (A) |
| match.finished | 1         | `…-e7d6665c` (B) |
| match.started  | 1         | `…-e7d6665c` (B) |

Nothing in the code knows there are two workers: Kafka splits the partitions
between the members of the group. With 2 partitions per topic, a 3rd worker
would get nothing to do — partitions are the limit on parallelism.

### 3. Rebuild the stats from Kafka

```bash
docker compose stop stats-worker
# delete leaderboard:*, stats:* (counts + dedup markers), matches:recent, game:*:history
kafka-consumer-groups.sh --group stats-worker --reset-offsets --to-earliest --all-topics --execute
docker compose start stats-worker; caughtup
```

- Deleted from Redis: the leaderboard, **84** dedup markers (42 races × 2 events)
  plus the match counts, the recent-matches list and **20** per-room histories.
- After the replay: match count **42** again, the same as before.
- **Caveat:** the leaderboard came back **different**. Before, it was full of bots
  from the Phase 6 load tests, which ran before Kafka existed. Those scores were
  never events, so a replay can't bring them back. The rebuilt board holds only
  races since Phase 7 (top 5: 65, 65, 65, 63, 63 WPM). Kafka can only replay what it saw,
  and only while the topic's retention keeps it (default 7 days).

The dedup markers had to be deleted too; otherwise the worker would have
skipped every replayed event as "already done", which is the dedup doing its job.

### 4. Kafka down during races

```bash
npm run load -- --rooms 10 --time 60          # terminal 1
sleep 10; docker compose stop kafka; sleep 30; docker compose start kafka   # terminal 2
```

- **10 / 10** races finished, **3,993 / 4,000** words confirmed, p95 **7 ms** —
  the same as without Kafka.
- Match count **42 → 52**: all 10 races counted.
- While Kafka was down, the worker's Kafka client logged `Connection refused`
  over and over, then reconnected by itself.

**What this does not show:** the races started around the moment Kafka stopped,
and finished after it was back. So most events were sent while Kafka was up.
A stricter test would stop Kafka _before_ the races start and keep it down until
they end, to see whether events sent during an outage are kept in the producer's buffer.

## Known issues / next

- The Kafka client logs a line per failed reconnect while the broker is down. Noisy, harmless.
- Rare gap in the dedup: if Redis dies _after_ an event is claimed but before
  its writes, giving the claim back fails too, and the retried event is skipped
  for 24 h. A Lua script doing claim + writes in one step would close it.
- One broker, replication factor 1: if its disk is lost, so are the events.
  Production would use 3 brokers (`replication.factor=3`, `min.insync.replicas=2`).
- Production (Phase 9) runs `EVENTS=inprocess`: free hosting has no Kafka. The
  switch is one setting, so the Kafka setup stays for local runs and demos.
