import { sql } from "drizzle-orm";
import { dbPostgres } from "../db";

const db = dbPostgres();

// Status page data (REQ-022, REQ-023). Read path is public — only monitors the
// owner explicitly placed on the page are ever included (05 §11).

export interface StatusPageRecord {
  id: string;
  userId: string;
  slug: string;
  title: string;
  description: string | null;
  createdAt: string;
}

export interface StatusPageMonitor {
  monitorId: string;
  name: string;
  status: string;
  active: boolean;
  uptime90d: number | null;
  bars: { day: string; uptime: number | null }[];
}

export interface PublicStatusPayload {
  slug: string;
  title: string;
  description: string | null;
  overall: "up" | "down" | "unknown";
  monitors: StatusPageMonitor[];
  activeIncidents: { monitorName: string; startedAt: string; reason: string }[];
}

export async function getStatusPageBySlug(slug: string): Promise<StatusPageRecord | undefined> {
  const rows = (await db.execute(sql`
    SELECT id, user_id AS "userId", slug, title, description, created_at AS "createdAt"
    FROM status_pages WHERE slug = ${slug}
  `)) as unknown as StatusPageRecord[];
  return rows[0];
}

export async function listStatusPages(userId: string): Promise<Pick<StatusPageRecord, "id" | "slug" | "title" | "description">[]> {
  const rows = (await db.execute(sql`
    SELECT id, slug, title, description FROM status_pages
    WHERE user_id = ${userId} ORDER BY created_at DESC
  `)) as unknown as { id: string; slug: string; title: string; description: string | null }[];
  return rows;
}

// Published monitors only: join through status_page_monitors (05 §11 opt-in rule).
export async function getStatusPageMonitors(pageId: string): Promise<StatusPageMonitor[]> {
  const monitors = (await db.execute(sql`
    SELECT m.id AS "monitorId", m.name, m.current_status AS status, m.active
    FROM status_page_monitors spm
    JOIN monitors m ON m.id = spm.monitor_id
    WHERE spm.status_page_id = ${pageId}
    ORDER BY spm.position, m.name
  `)) as unknown as StatusPageMonitor[];

  if (monitors.length === 0) return [];

  // One grouped query for every 90-day cell on the page — no per-monitor N+1.
  const bars = (await db.execute(sql`
    WITH cal AS (
      SELECT generate_series(
        date_trunc('day', now()) - interval '89 days',
        date_trunc('day', now()),
        interval '1 day'
      )::date AS day
    )
    SELECT spm.monitor_id AS "monitorId",
           to_char(cal.day, 'YYYY-MM-DD') AS day,
           CASE WHEN SUM(r.count) > 0 THEN round(100.0 * SUM(r.ok_count) / SUM(r.count), 2)::float8 END AS uptime
    FROM status_page_monitors spm
    CROSS JOIN cal
    LEFT JOIN check_rollups r
      ON r.monitor_id = spm.monitor_id
     AND r.bucket_size_sec = 3600
     AND r.bucket_start AT TIME ZONE 'UTC' >= cal.day
     AND r.bucket_start AT TIME ZONE 'UTC' < cal.day + interval '1 day'
    WHERE spm.status_page_id = ${pageId}
    GROUP BY spm.monitor_id, cal.day
    ORDER BY spm.monitor_id, cal.day
  `)) as unknown as { monitorId: string; day: string; uptime: number | null }[];

  const byMonitor = new Map<string, { day: string; uptime: number | null }[]>();
  for (const bar of bars) {
    const list = byMonitor.get(bar.monitorId) ?? [];
    list.push({ day: bar.day, uptime: bar.uptime });
    byMonitor.set(bar.monitorId, list);
  }

  return monitors.map((m) => {
    const cells = byMonitor.get(m.monitorId) ?? [];
    const withData = cells.filter((c) => c.uptime != null);
    const total = withData.length;
    // Overall uptime over the strip: average of days that had data; null when
    // the page has never been probed (rendered as no-data, not 0%).
    const uptime90d =
      total === 0
        ? null
        : Math.round((withData.reduce((s, c) => s + (c.uptime ?? 0), 0) / total) * 100) / 100;
    return { ...m, uptime90d, bars: cells };
  });
}

export async function getStatusPageIncidents(
  pageId: string,
): Promise<{ monitorName: string; startedAt: string; reason: string }[]> {
  const rows = (await db.execute(sql`
    SELECT m.name AS "monitorName", i.started_at AS "startedAt", i.reason
    FROM incidents i
    JOIN monitors m ON m.id = i.monitor_id
    JOIN status_page_monitors spm ON spm.monitor_id = m.id
    WHERE spm.status_page_id = ${pageId} AND i.status = 'open'
    ORDER BY i.started_at DESC
  `)) as unknown as { monitorName: string; startedAt: string; reason: string }[];
  return rows;
}

export async function buildPublicStatus(pageId: string): Promise<PublicStatusPayload | null> {
  const page = await getStatusPageById(pageId);
  if (!page) return null;
  const monitors = await getStatusPageMonitors(pageId);
  const activeIncidents = await getStatusPageIncidents(pageId);
  const anyDown = monitors.some((m) => m.status === "down");
  return {
    slug: page.slug,
    title: page.title,
    description: page.description,
    overall: monitors.length === 0 ? "unknown" : anyDown ? "down" : "up",
    monitors,
    activeIncidents,
  };
}

export async function getStatusPageById(id: string): Promise<StatusPageRecord | undefined> {
  const rows = (await db.execute(sql`
    SELECT id, user_id AS "userId", slug, title, description, created_at AS "createdAt"
    FROM status_pages WHERE id = ${id}
  `)) as unknown as StatusPageRecord[];
  return rows[0];
}
