import { enhance, type UniversalHandler } from "@universal-middleware/core";
import { notFound, unauthorized } from "./http";
import { requireUserId } from "./session";
import { monitorExistsForUser } from "../database/drizzle/queries/checks";
import { sql } from "drizzle-orm";
import { dbPostgres } from "../database/drizzle/db";

const db = dbPostgres();

// Incident timeline API (REQ-020): per-monitor and account-wide, newest first.

interface IncidentRow {
  id: string;
  monitorId: string;
  monitorName?: string;
  startedAt: string;
  endedAt: string | null;
  status: string;
  reason: string;
}

async function fetchIncidents(where: ReturnType<typeof sql>, limit: number, offset: number): Promise<IncidentRow[]> {
  const rows = (await db.execute(sql`
    SELECT i.id, i.monitor_id AS "monitorId", m.name AS "monitorName",
           i.started_at AS "startedAt", i.ended_at AS "endedAt", i.status, i.reason
    FROM incidents i JOIN monitors m ON m.id = i.monitor_id
    WHERE ${where}
    ORDER BY i.started_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `)) as unknown as IncidentRow[];
  return rows;
}

function limitOffset(url: URL): { limit: number; offset: number } {
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 1), 200);
  const offset = Math.max(parseInt(url.searchParams.get("cursor") ?? "0", 10) || 0, 0);
  return { limit, offset };
}

export const monitorIncidentsHandler: UniversalHandler = enhance(
  async (request, _context, runtime) => {
    const userId = await requireUserId(request, runtime);
    if (!userId) return unauthorized();

    const id = new URL(request.url).pathname.split("/")[3] ?? "";
    if (!(await monitorExistsForUser(id, userId))) return notFound();

    const { limit, offset } = limitOffset(new URL(request.url));
    const incidents = await fetchIncidents(sql`i.monitor_id = ${id}`, limit, offset);
    return Response.json({ incidents });
  },
  { name: "lunite:monitor-incidents", path: "/api/monitors/:id/incidents", method: "GET", immutable: false },
);

export const allIncidentsHandler: UniversalHandler = enhance(
  async (request, _context, runtime) => {
    const userId = await requireUserId(request, runtime);
    if (!userId) return unauthorized();

    const { limit, offset } = limitOffset(new URL(request.url));
    const incidents = await fetchIncidents(sql`m.user_id = ${userId}`, limit, offset);
    return Response.json({ incidents });
  },
  { name: "lunite:all-incidents", path: "/api/incidents", method: "GET", immutable: false },
);
