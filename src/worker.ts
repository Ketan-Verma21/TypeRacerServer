// Stats worker (Phase 7): a separate process that reads match events from
// Kafka and writes the leaderboard, match history and match counts to Redis.
// The game servers only send events, so a slow stats write never slows a race.
//   npm run build && npm run worker     (needs Redis and Kafka; Compose runs it)
import "dotenv/config";
import { KafkaStatsConsumer } from "./adapters/kafka/KafkaStatsConsumer";
import { SystemClock } from "./adapters/SystemClock";
import { loadConfig } from "./config/env";
import { createStores } from "./container";
import { createConsumer, createKafka } from "./infra/kafka";
import { keepTrying } from "./infra/keepTrying";
import { PinoLogger } from "./infra/PinoLogger";
import { createRedisClient } from "./infra/redis";
import { StatsService } from "./services/StatsService";

/** All workers share this group, so Kafka splits the partitions between them. */
const STATS_GROUP = "stats-worker";

const config = loadConfig();
const logger = PinoLogger.create(config);

process.on("unhandledRejection", (reason) =>
    logger.error("unhandled rejection", { reason: String(reason) }),
);

// The game servers read the leaderboard from Redis, so the worker must write there.
if (config.store !== "redis") {
    throw new Error("the stats worker needs STORE=redis (the game servers read stats from Redis)");
}

const redis = createRedisClient(config.redisUrl, logger);
const { leaderboard, history, processed } = createStores("redis", new SystemClock(), redis);
const stats = new StatsService({ leaderboard, history, processed });

const consumer = createConsumer(createKafka(config.kafkaBrokers, config.instanceId), STATS_GROUP);
const statsConsumer = new KafkaStatsConsumer(consumer, stats, logger);

const stopConnecting = keepTrying(
    "kafka",
    async () => {
        await consumer.connect();
        await statsConsumer.start();
    },
    logger,
);
logger.info("stats worker started", { group: STATS_GROUP, brokers: config.kafkaBrokers });

// On SIGTERM leave the group cleanly, so Kafka hands our partitions to the
// other workers right away instead of waiting for a timeout.
let stopping = false;
function shutdown(signal: string): void {
    if (stopping) return;
    stopping = true;
    logger.info("shutting down", { signal });
    stopConnecting();
    statsConsumer.stop();
    void (async () => {
        await consumer.disconnect().catch(() => {}); // leave the group first
        await redis.quit().catch(() => {});
        process.exit(0);
    })();
    setTimeout(() => process.exit(0), 5000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
