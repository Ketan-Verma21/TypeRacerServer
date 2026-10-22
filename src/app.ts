import express, { type Express } from "express";
import { healthRouter } from "./transport/http/health";

/** The HTTP app on its own, so tests can use it without a real server. */
export function createHttpApp(): Express {
    const app = express();
    app.use(express.json());
    app.use(healthRouter());
    return app;
}
