import { enhance, type UniversalHandler } from "@universal-middleware/core";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { notFound, conflict, unauthorized, validation } from "./http";
import { requireUserId } from "./session";
import { dbPostgres } from "../database/drizzle/db";
import { redisPublisher } from "../lib/redis";
import {
  buildPublicStatus,
  listStatusPages,
  getStatusPageBySlug,
  SLUG_RE,
  type PublicStatusPayload,
} from "../database/drizzle/queries/status";

const db = dbPostgres();

// Shape returned to the client for status-page management.
export interface PublicStatusPage {
  id: string;
  slug: string;
  title: string;
  description: string | null;
}

// Status pages (REQ-022, REQ-023): owner CRUD + public read by slug. The public
// payload is cached in Redis for 60s (06 §7) and invalidated when the owner
// edits the page; monitor/incident changes propagate within the TTL window.

const CACHE_TTL = 60;

const createSchema = z.object({
  slug: z.string().regex(SLUG_RE, "lowercase letters, digits and dashes only (3-40)"),
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  monitorIds: z.array(z.string()).default([]),
});

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional().nullable(),
  monitorIds: z.array(z.string()).optional(),
});

function cacheKey(slug: string): string {
  return `sp:${slug}`;
}

async function invalidateCache(slug: string): Promise<void> {
  try {
    await redisPublisher().del(cacheKey(slug));
  } catch {
    // Cache is best-effort; TTL covers Redis being unavailable (ADR-008).
  }
}

async function cachedStatus(slug: string): Promise<PublicStatusPayload | null> {
  try {
    const hit = await redisPublisher().get(cacheKey(slug));
    if (hit) return JSON.parse(hit) as PublicStatusPayload;
  } catch {
    // Redis down → fall through to Postgres (04 §6 fallback).
  }
  const page = await getStatusPageBySlug(slug);
  if (!page) return null;
  const payload = await buildPublicStatus(page.id);
  if (payload) {
    try {
      await redisPublisher().set(cacheKey(slug), JSON.stringify(payload), "EX", CACHE_TTL);
    } catch {
      // best-effort
    }
  }
  return payload;
}

async function setMonitors(pageId: string, userId: string, monitorIds: string[]): Promise<void> {
  await db.execute(sql`DELETE FROM status_page_monitors WHERE status_page_id = ${pageId}`);
  if (monitorIds.length === 0) return;
  // Validate ownership of every referenced monitor before publishing (REQ-032).
  // Checked one-by-one: drizzle flattens array params inside ANY(), which the
  // driver can't cast back to text[].
  let position = 0;
  for (const id of monitorIds) {
    if (position >= 50) break; // defensive bound; user max is 20 monitors
    const owned = (await db.execute(sql`
      SELECT 1 FROM monitors WHERE user_id = ${userId} AND id = ${id} LIMIT 1
    `)) as unknown[];
    if (owned.length === 0) continue;
    await db.execute(sql`
      INSERT INTO status_page_monitors (status_page_id, monitor_id, position)
      VALUES (${pageId}, ${id}, ${position}) ON CONFLICT DO NOTHING
    `);
    position += 1;
  }
}

export const listStatusPagesHandler: UniversalHandler = enhance(
  async (request, _context, runtime) => {
    const userId = await requireUserId(request, runtime);
    if (!userId) return unauthorized();
    return Response.json({ pages: await listStatusPages(userId) });
  },
  { name: "lunite:list-status-pages", path: "/api/status-pages", method: "GET", immutable: false },
);

export const createStatusPageHandler: UniversalHandler = enhance(
  async (request, _context, runtime) => {
    const userId = await requireUserId(request, runtime);
    if (!userId) return unauthorized();
    const parsed = createSchema.safeParse(await request.json().catch(() => undefined));
    if (!parsed.success) {
      return validation("Invalid body", parsed.error.issues.map((i) => ({ path: i.path.join("."), reason: i.message })));
    }
    const { slug, title, description, monitorIds } = parsed.data;

    const existing = await getStatusPageBySlug(slug);
    if (existing) return conflict("Slug already taken");

    const rows = (await db.execute(sql`
      INSERT INTO status_pages (id, user_id, slug, title, description)
      VALUES (gen_random_uuid(), ${userId}, ${slug}, ${title}, ${description ?? null})
      RETURNING id, slug, title, description
    `)) as unknown as { id: string; slug: string; title: string; description: string | null }[];
    await setMonitors(rows[0].id, userId, monitorIds);
    await invalidateCache(slug);
    return Response.json({ page: rows[0] }, { status: 201 });
  },
  { name: "lunite:create-status-page", path: "/api/status-pages", method: "POST", immutable: false },
);

export const updateStatusPageHandler: UniversalHandler = enhance(
  async (request, _context, runtime) => {
    const userId = await requireUserId(request, runtime);
    if (!userId) return unauthorized();
    const id = runtime.params!.id;
    const parsed = updateSchema.safeParse(await request.json().catch(() => undefined));
    if (!parsed.success) {
      return validation("Invalid body", parsed.error.issues.map((i) => ({ path: i.path.join("."), reason: i.message })));
    }

    const rows = (await db.execute(sql`
      UPDATE status_pages SET title = COALESCE(${parsed.data.title ?? null}, title)
      WHERE id = ${id} AND user_id = ${userId}
      RETURNING id, slug, title, description
    `)) as unknown as { id: string; slug: string; title: string; description: string | null }[];
    if (rows.length === 0) return notFound();

    // description is nullable — distinguish "not provided" from "set to null".
    if (parsed.data.description !== undefined) {
      await db.execute(sql`
        UPDATE status_pages SET description = ${parsed.data.description}
        WHERE id = ${id} AND user_id = ${userId}
      `);
    }
    if (parsed.data.monitorIds) await setMonitors(id, userId, parsed.data.monitorIds);
    await invalidateCache(rows[0].slug);
    const fresh = (await db.execute(sql`
      SELECT id, slug, title, description FROM status_pages WHERE id = ${id}
    `)) as unknown as { id: string; slug: string; title: string; description: string | null }[];
    return Response.json({ page: fresh[0] });
  },
  { name: "lunite:update-status-page", path: "/api/status-pages/:id", method: "PATCH", immutable: false },
);

export const deleteStatusPageHandler: UniversalHandler = enhance(
  async (request, _context, runtime) => {
    const userId = await requireUserId(request, runtime);
    if (!userId) return unauthorized();
    const id = runtime.params!.id;
    // Ownership first — never touch join rows of a page we don't own (REQ-032).
    const owned = (await db.execute(sql`
      SELECT slug FROM status_pages WHERE id = ${id} AND user_id = ${userId}
    `)) as unknown as { slug: string }[];
    if (owned.length === 0) return notFound();
    // FK status_page_monitors has no ON DELETE CASCADE (0004) — drop the join
    // rows first or the delete fails with a FK violation.
    await db.execute(sql`DELETE FROM status_page_monitors WHERE status_page_id = ${id}`);
    await db.execute(sql`DELETE FROM status_pages WHERE id = ${id}`);
    await invalidateCache(owned[0].slug);
    return new Response(null, { status: 204 });
  },
  { name: "lunite:delete-status-page", path: "/api/status-pages/:id", method: "DELETE", immutable: false },
);

// Public read (REQ-022): no authentication, unknown slug → 404 with no hint.
export const publicStatusHandler: UniversalHandler = enhance(
  async (request) => {
    const slug = new URL(request.url).pathname.split("/").pop() ?? "";
    if (!SLUG_RE.test(slug)) return notFound();
    const payload = await cachedStatus(slug);
    if (!payload) return notFound();
    return Response.json(payload);
  },
  { name: "lunite:public-status", path: "/api/status/:slug", method: "GET", immutable: false },
);
