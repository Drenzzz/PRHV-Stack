import { betterAuthHandler, betterAuthSessionMiddleware } from "./better-auth-handler";
import { dbMiddleware } from "./db-middleware";
import { createTodoHandler } from "./create-todo-handler";
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
    createTodoHandler,
  ]);

  return app;
}

export const app = getApp();
