import type { RuntimeAdapter } from "@universal-middleware/core";
import { sql } from "drizzle-orm";
import { dbPostgres } from "../database/drizzle/db";
import { hashApiKey } from "../lib/crypto";
import { getAuth } from "./better-auth-handler";

const db = dbPostgres();

// Auth for API keys (REQ-025): `Authorization: Bearer <secret>` resolves to the
// owning user, but only for READ routes (05 §4.1). Write routes keep calling
// requireUserId so a stolen key can never mutate anything. The per-key rate
// limit lives in rateLimitMiddleware — one place for every limit.

export interface Principal {
  userId: string;
  via: "session" | "apikey";
  keyId?: string;
}

// Returns null when neither session nor bearer authenticates.
export async function requirePrincipal(
  request: Request,
  runtime: RuntimeAdapter,
): Promise<Principal | null> {
  const bearer = request.headers.get("authorization");
  if (bearer?.startsWith("Bearer ")) {
    const secret = bearer.slice(7).trim();
    if (!secret) return null;

    const rows = (await db.execute(sql`
      SELECT id, user_id FROM api_keys
      WHERE key_hash = ${hashApiKey(secret)} AND revoked_at IS NULL
    `)) as unknown as { id: string; user_id: string }[];
    if (rows.length === 0) return null;

    // Non-blocking bookkeeping — not part of the auth decision.
    db.execute(sql`UPDATE api_keys SET last_used_at = now() WHERE id = ${rows[0].id}`).catch(() => {});

    return { userId: rows[0].user_id, via: "apikey", keyId: rows[0].id };
  }

  const session = await getAuth(runtime).api.getSession({ headers: request.headers });
  if (!session?.user?.id) return null;
  return { userId: session.user.id, via: "session" };
}
