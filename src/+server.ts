import type { Server } from "vike/types";
import { app } from "./server/hono";

// https://vike.dev/server
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

export default {
  fetch: app.fetch,
  prod: {
    port,
  },
} satisfies Server;

// In-process fetch for integration tests (no listening socket needed).
export const testFetch: typeof fetch = app.fetch as unknown as typeof fetch;
