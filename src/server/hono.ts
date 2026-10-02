import { betterAuthHandler, betterAuthSessionMiddleware } from "./better-auth-handler";
import { dbMiddleware } from "./db-middleware";
import { rateLimitMiddleware } from "./rate-limit";
import { liveEventsHandler } from "./sse";
import { metricsHandler, uptimeDailyHandler } from "./metrics";
import { monitorIncidentsHandler, allIncidentsHandler } from "./incidents";
import { createChannelHandler, listChannelsHandler, testChannelHandler } from "./channels";
import { createApiKeyHandler, listApiKeysHandler, revokeApiKeyHandler } from "./api-keys";
import { docsHandler, specHandler } from "./openapi";
import {
  createStatusPageHandler,
  deleteStatusPageHandler,
  listStatusPagesHandler,
  publicStatusHandler,
  updateStatusPageHandler,
} from "./status";
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
    // Rate limits before anything else touches the DB (REQ-026)
    rateLimitMiddleware,
    // Append Better Auth user to context
    betterAuthSessionMiddleware,
    // Better Auth route. See https://better-auth.com/docs/installation
    betterAuthHandler,
    // API docs must win over the Vike page fallthrough (02 §8)
    specHandler,
    docsHandler,
    liveEventsHandler,
    listMonitorsHandler,
    createMonitorHandler,
    getMonitorHandler,
    updateMonitorHandler,
    deleteMonitorHandler,
    checkNowHandler,
    metricsHandler,
    uptimeDailyHandler,
    monitorIncidentsHandler,
    allIncidentsHandler,
    createChannelHandler,
    listChannelsHandler,
    testChannelHandler,
    listStatusPagesHandler,
    createStatusPageHandler,
    updateStatusPageHandler,
    deleteStatusPageHandler,
    publicStatusHandler,
    createApiKeyHandler,
    listApiKeysHandler,
    revokeApiKeyHandler,
  ]);

  return app;
}

export const app = getApp();
