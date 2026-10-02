import { enhance, type UniversalHandler } from "@universal-middleware/core";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { notFound, unauthorized, validation } from "./http";
import { requireUserId } from "./session";
import { dbPostgres } from "../database/drizzle/db";
import { apiKeyPrefix, generateApiKeySecret, hashApiKey } from "../lib/crypto";

const db = dbPostgres();

// API keys (REQ-025): session-only management (05 §4.1), secret shown exactly
// once at creation, stored only as a SHA-256 hash, revocable at any time.

export interface PublicApiKey {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

const createSchema = z.object({ name: z.string().min(1).max(100) });

export const createApiKeyHandler: UniversalHandler = enhance(
  async (request, _context, runtime) => {
    const userId = await requireUserId(request, runtime);
    if (!userId) return unauthorized();
    const parsed = createSchema.safeParse(await request.json().catch(() => undefined));
    if (!parsed.success) {
      return validation("Invalid body", parsed.error.issues.map((i) => ({ path: i.path.join("."), reason: i.message })));
    }

    const secret = generateApiKeySecret();
    const rows = (await db.execute(sql`
      INSERT INTO api_keys (id, user_id, name, prefix, key_hash)
      VALUES (gen_random_uuid(), ${userId}, ${parsed.data.name}, ${apiKeyPrefix(secret)}, ${hashApiKey(secret)})
      RETURNING id, name, prefix, last_used_at AS "lastUsedAt", revoked_at AS "revokedAt", created_at AS "createdAt"
    `)) as unknown as PublicApiKey[];

    // The only time the plaintext secret ever leaves the server (REQ-025).
    return Response.json({ key: rows[0], secret }, { status: 201 });
  },
  { name: "lunite:create-api-key", path: "/api-keys", method: "POST", immutable: false },
);

export const listApiKeysHandler: UniversalHandler = enhance(
  async (request, _context, runtime) => {
    const userId = await requireUserId(request, runtime);
    if (!userId) return unauthorized();
    const rows = (await db.execute(sql`
      SELECT id, name, prefix, last_used_at AS "lastUsedAt", revoked_at AS "revokedAt", created_at AS "createdAt"
      FROM api_keys WHERE user_id = ${userId} ORDER BY created_at DESC
    `)) as unknown as PublicApiKey[];
    return Response.json({ keys: rows });
  },
  { name: "lunite:list-api-keys", path: "/api-keys", method: "GET", immutable: false },
);

export const revokeApiKeyHandler: UniversalHandler = enhance(
  async (request, _context, runtime) => {
    const userId = await requireUserId(request, runtime);
    if (!userId) return unauthorized();
    const id = runtime.params!.id;
    const rows = (await db.execute(sql`
      UPDATE api_keys SET revoked_at = now()
      WHERE id = ${id} AND user_id = ${userId} AND revoked_at IS NULL
      RETURNING id
    `)) as unknown as { id: string }[];
    if (rows.length === 0) return notFound();
    return new Response(null, { status: 204 });
  },
  { name: "lunite:revoke-api-key", path: "/api-keys/:id", method: "DELETE", immutable: false },
);
