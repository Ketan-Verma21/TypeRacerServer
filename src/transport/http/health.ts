import { Router } from "express";

/** Can this server take games right now? (With STORE=redis: does Redis answer?) */
export type ReadinessCheck = () => Promise<boolean>;

const alwaysReady: ReadinessCheck = async () => true;

/**
 * GET /health — the Flutter app pings this on launch to wake the free-tier
 * server and waits for `db: true`, so `db` reports whether the store is
 * reachable (always true with STORE=memory).
 */
export function healthRouter(isReady: ReadinessCheck = alwaysReady): Router {
    const ready = (): Promise<boolean> => isReady().catch(() => false);
    const router = Router();
    router.get("/health", async (_req, res) => {
        res.set("Access-Control-Allow-Origin", "*"); // lets Flutter web call it
        res.json({ ok: true, db: await ready(), uptime: Math.round(process.uptime()) });
    });
    // liveness: the process is up (never checks Redis, so Docker doesn't restart us for it).
    router.get("/health/live", (_req, res) => {
        res.json({ ok: true });
    });
    // readiness: it can serve games. 503 tells a load balancer to skip this instance.
    router.get("/health/ready", async (_req, res) => {
        const ok = await ready();
        res.status(ok ? 200 : 503).json({ ok });
    });
    router.get("/", (_req, res) => {
        res.send("Type Racer server is running");
    });
    return router;
}
