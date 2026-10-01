import type { dbPostgres } from "./database/drizzle/db";
import type { User } from "better-auth";

declare global {
  namespace Vike {
    interface PageContextServer {
      db: ReturnType<typeof dbPostgres>;
    }
    interface PageContext {
      // Set by `betterAuthSessionMiddleware`, then passed to the client via `passToClient`.
      user?: User | null;
    }
  }
}
