import { sql } from "drizzle-orm";
import { dbPostgres } from "../db";

const db = dbPostgres();

// Dashboard read support (STEP-M3-01): derived fields for the monitor list and
// the 90-day uptime bar. Read-only, user-scoped (REQ-032).

export interface MonitorListRow {
  id: string;
  name: string;
  url: string;
  active: boolean;
  currentStatus: string;
  intervalSec: number;
  lastLatencyMs: number | null;
  uptime30d: number | null;
}

// Single query for the whole list — no per-monitor N+1 (06 §11).
// uptime30d comes from 1h rollups (raw retention is only 7 days).
export async function listMonitorsEnriched(userId: string): Promise<MonitorListRow[]> {
  const rows = (await db.execute(sql`
    SELECT
      m.id, m.name, m.url, m.active, m.current_status AS "currentStatus",
      m.interval_sec AS "intervalSec",
      (SELECT c.latency_ms FROM checks c
       WHERE c.monitor_id = m.id AND c.ok
       ORDER BY c.checked_at DESC LIMIT 1) AS "lastLatencyMs",
      CASE WHEN SUM(r.count) > 0
        THEN round(100.0 * SUM(r.ok_count) / SUM(r.count), 2)::float8
        ELSE NULL END AS "uptime30d"
    FROM monitors m
    LEFT JOIN check_rollups r
      ON r.monitor_id = m.id
     AND r.bucket_size_sec = 3600
     AND r.bucket_start >= now() - interval '30 days'
    WHERE m.user_id = ${userId}
    GROUP BY m.id, m.name, m.url, m.active, m.current_status, m.interval_sec
    ORDER BY m.created_at DESC
  `)) as unknown as MonitorListRow[];
  return rows;
}

export interface DayCell {
  day: string; // YYYY-MM-DD (UTC)
  uptime: number | null; // null = no data that day (rendered neutral)
  count: number;
}

// One cell per day from 1h rollups (REQ-023). Days with no probes get
// uptime=null so the bar renders them neutral — never 0%.
export async function uptimeDaily(
  monitorId: string,
  days: number,
): Promise<DayCell[]> {
  const rows = (await db.execute(sql`
    WITH cal AS (
      SELECT generate_series(
        date_trunc('day', now()) - (${days} - 1) * interval '1 day',
        date_trunc('day', now()),
        interval '1 day'
      )::date AS day
    )
    SELECT to_char(cal.day, 'YYYY-MM-DD') AS day,
           CASE WHEN SUM(r.count) > 0 THEN round(100.0 * SUM(r.ok_count) / SUM(r.count), 2)::float8 ELSE NULL END AS uptime,
           COALESCE(SUM(r.count), 0)::int AS count
    FROM cal
    LEFT JOIN check_rollups r
      ON r.monitor_id = ${monitorId}
     AND r.bucket_size_sec = 3600
     AND r.bucket_start AT TIME ZONE 'UTC' >= cal.day
     AND r.bucket_start AT TIME ZONE 'UTC' < cal.day + interval '1 day'
    GROUP BY cal.day
    ORDER BY cal.day
  `)) as unknown as DayCell[];
  return rows;
}
