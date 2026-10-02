import { enhance, type UniversalHandler } from "@universal-middleware/core";
import { z } from "zod";
import { notFound, conflict, unauthorized, validation } from "./http";
import { requireUserId } from "./session";
import {
  countMonitors,
  createMonitor,
  deleteMonitor,
  getMonitor,
  listMonitors,
  updateMonitor,
} from "../database/drizzle/queries/monitors";
import { claimMonitorNow } from "../worker/scheduler";

// Monitor CRUD (REQ-005..008). Ownership → 404 without leak (REQ-032).
// Limits per plan defaults: min interval 30s, max 20 monitors/user (OQ-005 resolved).

const MAX_MONITORS = 20;
const MIN_INTERVAL_SEC = 30;

const createSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.url().refine((u) => /^https?:\/\//i.test(u), "URL must be http(s)"),
  method: z.enum(["GET", "HEAD", "POST"]).default("GET"),
  intervalSec: z.number().int().min(MIN_INTERVAL_SEC).default(60),
  timeoutMs: z.number().int().min(1000).max(60000).default(10000),
  expectedStatus: z.number().int().min(100).max(599).optional(),
  expectedKeywords: z.array(z.string().min(1)).default([]),
  sslCheck: z.boolean().default(false),
});

const updateSchema = createSchema.partial().extend({
  active: z.boolean().optional(),
});

function zodFields(error: z.ZodError) {
  return error.issues.map((i) => ({ path: i.path.join("."), reason: i.message }));
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export const listMonitorsHandler: UniversalHandler = enhance(
  async (request, _context, runtime) => {
    const userId = await requireUserId(request, runtime);
    if (!userId) return unauthorized();
    return Response.json({ monitors: await listMonitors(userId) });
  },
  { name: "lunite:list-monitors", path: "/api/monitors", method: "GET", immutable: false },
);

export const createMonitorHandler: UniversalHandler = enhance(
  async (request, _context, runtime) => {
    const userId = await requireUserId(request, runtime);
    if (!userId) return unauthorized();
    const parsed = createSchema.safeParse(await readJson(request));
    if (!parsed.success) return validation("Invalid body", zodFields(parsed.error));
    if ((await countMonitors(userId)) >= MAX_MONITORS) {
      return conflict(`Monitor limit reached (${MAX_MONITORS} per user)`);
    }
    // CF-010 default: probe immediately — next_check_at = now().
    const created = await createMonitor({ ...parsed.data, userId, nextCheckAt: new Date() });
    return Response.json({ monitor: created }, { status: 201 });
  },
  { name: "lunite:create-monitor", path: "/api/monitors", method: "POST", immutable: false },
);

export const getMonitorHandler: UniversalHandler = enhance(
  async (request, context, runtime) => {
    const userId = await requireUserId(request, runtime);
    if (!userId) return unauthorized();
    const monitor = await getMonitor(userId, runtime.params!.id);
    if (!monitor) return notFound();
    return Response.json({ monitor });
  },
  { name: "lunite:get-monitor", path: "/api/monitors/:id", method: "GET", immutable: false },
);

export const updateMonitorHandler: UniversalHandler = enhance(
  async (request, context, runtime) => {
    const userId = await requireUserId(request, runtime);
    if (!userId) return unauthorized();
    const parsed = updateSchema.safeParse(await readJson(request));
    if (!parsed.success) return validation("Invalid body", zodFields(parsed.error));
    const { active, ...fields } = parsed.data;
    // Pause/resume semantics (REQ-007): paused ⇒ next_check_at NULL; resume ⇒ due now.
    const patch = {
      ...fields,
      ...(active === undefined ? {} : { active, nextCheckAt: active ? new Date() : null }),
    };
    const updated = await updateMonitor(userId, runtime.params!.id, patch);
    if (!updated) return notFound();
    return Response.json({ monitor: updated });
  },
  { name: "lunite:update-monitor", path: "/api/monitors/:id", method: "PATCH", immutable: false },
);

export const deleteMonitorHandler: UniversalHandler = enhance(
  async (request, context, runtime) => {
    const userId = await requireUserId(request, runtime);
    if (!userId) return unauthorized();
    const deleted = await deleteMonitor(userId, runtime.params!.id);
    if (!deleted) return notFound();
    return new Response(null, { status: 204 });
  },
  { name: "lunite:delete-monitor", path: "/api/monitors/:id", method: "DELETE", immutable: false },
);

// Manual "check now" (REQ-030): schedule an immediate probe. Paused monitors
// are rejected — a paused monitor must not be probed until resumed (REQ-007).
export const checkNowHandler: UniversalHandler = enhance(
  async (request, context, runtime) => {
    const userId = await requireUserId(request, runtime);
    if (!userId) return unauthorized();
    const monitor = await getMonitor(userId, runtime.params!.id);
    if (!monitor) return notFound();
    if (!monitor.active) return conflict("Monitor is paused");
    await claimMonitorNow(userId, runtime.params!.id);
    return Response.json({}, { status: 202 });
  },
  { name: "lunite:check-now", path: "/api/monitors/:id/check", method: "POST", immutable: false },
);
