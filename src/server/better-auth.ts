import { dbPostgres } from "../database/drizzle/db";
import { env } from "./env";
import type { RuntimeAdapter } from "@universal-middleware/core";
import type { BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import * as authSchema from "../database/drizzle/schema/auth";

function getDrizzleDb(_runtime?: RuntimeAdapter) {
  return dbPostgres();
}

// Better Auth keeps its own tables (user/session/account/verification) so it only needs the engine.
// With Drizzle it reuses the app's instance (Drizzle owns the schema + migrations); otherwise it
// opens its own connection and creates the tables via `better-auth:migrate` (or a D1 SQL migration).
function getDatabase(_runtime?: RuntimeAdapter): BetterAuthOptions["database"] {
  return drizzleAdapter(getDrizzleDb(_runtime), {
    provider: "pg",
    schema: authSchema,
  });
}

export function getAuthConfig(runtime?: RuntimeAdapter): BetterAuthOptions {
  return {
    secret: env.BETTER_AUTH_SECRET,
    database: getDatabase(runtime),
    emailAndPassword: {
      enabled: true,
    },
    // Extra origins allowed to call the auth API (e.g. dev on another port).
    // Comma-separated via TRUSTED_ORIGINS.
    trustedOrigins: (env.TRUSTED_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  };
}
