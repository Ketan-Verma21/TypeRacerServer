import { Router } from "express";

/**
 * GET /health — the Flutter app pings this on launch to wake the free-tier
 * server. v1 also reported the database; `db` stays `true` because the app
 * waits for it (there is no database until Redis arrives in Phase 4).
 */
export function healthRouter(): Router {
    const router = Router();
    router.get("/health", (_req, res) => {
        res.set("Access-Control-Allow-Origin", "*"); // lets Flutter web call it
        res.json({ ok: true, db: true, uptime: Math.round(process.uptime()) });
    });
    router.get("/", (_req, res) => {
        res.send("Type Racer server is running");
    });
    return router;
}
