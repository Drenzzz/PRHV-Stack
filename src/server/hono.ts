import { betterAuthHandler, betterAuthSessionMiddleware } from "./better-auth-handler";
import { dbMiddleware } from "./db-middleware";
import {
  createMonitorHandler,
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
    listMonitorsHandler,
    createMonitorHandler,
    getMonitorHandler,
    updateMonitorHandler,
    deleteMonitorHandler,
  ]);

  return app;
}

export const app = getApp();
