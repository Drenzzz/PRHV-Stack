import { betterAuthHandler, betterAuthSessionMiddleware } from "./better-auth-handler";
import { dbMiddleware } from "./db-middleware";
import { liveEventsHandler } from "./sse";
import { metricsHandler } from "./metrics";
import {
  createMonitorHandler,
  checkNowHandler,
  deleteMonitorHandler,
  getMonitorHandler,
  listMonitorsHandler,
  updateMonitorHandler,
} from "./monitors";
import vike from "@vikejs/hono";
import { Hono } from "hono";

function getApp() {
  const app = new Hono();

  vike(app, [
    // Make database available in Context as `context.db`
    dbMiddleware,
    // Append Better Auth user to context
    betterAuthSessionMiddleware,
    // Better Auth route. See https://better-auth.com/docs/installation
    betterAuthHandler,
    liveEventsHandler,
    listMonitorsHandler,
    createMonitorHandler,
    getMonitorHandler,
    updateMonitorHandler,
    deleteMonitorHandler,
    checkNowHandler,
    metricsHandler,
  ]);

  return app;
}

export const app = getApp();
