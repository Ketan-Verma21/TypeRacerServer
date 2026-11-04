import express, { type Express } from "express";
import { healthRouter, type HealthOptions } from "./transport/http/health";

export type HttpAppOptions = HealthOptions;

/** The HTTP app on its own, so tests can use it without a real server. */
export function createHttpApp(options: HttpAppOptions = {}): Express {
    const app = express();
    app.use(express.json());
    app.use(healthRouter(options));
    return app;
}
