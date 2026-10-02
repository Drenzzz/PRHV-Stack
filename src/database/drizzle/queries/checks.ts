import { and, eq, sql } from "drizzle-orm";
import { dbPostgres } from "../db";
import { checks } from "../schema/lunite";

const db = dbPostgres();

// Metrics aggregation over raw checks (REQ-013, REQ-014).
// Exact percentiles via percentile_cont over successful probes only (03 §6).

export interface BucketRow {
  t: string;
  count: number;
  okCount: number;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  min: number | null;
  max: number | null;
  uptime: number | null;
}

export interface MetricsResult {
  range: string;
  bucket: string;
  uptimePercent: number;
  series: BucketRow[];
}

export const RANGE_SECONDS: Record<string, number> = {
  "1h": 3600,
  "24h": 86400,
  "7d": 604800,
  "30d": 2592000,
  "90d": 7776000,
};

export const BUCKET_SECONDS: Record<string, number> = {
  "5m": 300,
  "1h": 3600,
};

export async function metricsFromRaw(
  monitorId: string,
  rangeKey: string,
  bucketKey: string,
): Promise<MetricsResult> {
  const rangeSec = RANGE_SECONDS[rangeKey];
  const bucketSec = BUCKET_SECONDS[bucketKey];

  const rows = (await db.execute(sql`
    WITH check_window AS (
      SELECT * FROM checks
      WHERE monitor_id = ${monitorId} AND checked_at >= now() - (${rangeSec} * interval '1 second')
    ),
    buckets AS (
      SELECT
        to_timestamp(floor(extract(epoch FROM checked_at) / ${bucketSec}) * ${bucketSec}) AS t,
        count(*) AS count,
        count(*) FILTER (WHERE ok) AS ok_count,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE ok) AS p50,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE ok) AS p95,
        percentile_cont(0.99) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE ok) AS p99,
        min(latency_ms) FILTER (WHERE ok) AS min_ms,
        max(latency_ms) FILTER (WHERE ok) AS max_ms
      FROM check_window
      GROUP BY t
    )
    SELECT
      t,
      count,
      ok_count,
      -- Cross-bucket percentiles are approximations; exact overall percentiles:
      (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) FROM check_window WHERE ok) AS overall_p50,
      (SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) FROM check_window WHERE ok) AS overall_p95,
      (SELECT percentile_cont(0.99) WITHIN GROUP (ORDER BY latency_ms) FROM check_window WHERE ok) AS overall_p99,
      b.*
    FROM buckets b ORDER BY t;
  `)) as unknown as Array<Record<string, unknown>>;

  const series: BucketRow[] = rows.map((r) => ({
    t: String(r.t),
    count: Number(r.count),
    okCount: Number(r.ok_count),
    p50: r.p50 != null ? Math.round(Number(r.p50)) : null,
    p95: r.p95 != null ? Math.round(Number(r.p95)) : null,
    p99: r.p99 != null ? Math.round(Number(r.p99)) : null,
    min: r.min_ms != null ? Math.round(Number(r.min_ms)) : null,
    max: r.max_ms != null ? Math.round(Number(r.max_ms)) : null,
    uptime: Number(r.count) > 0 ? (Number(r.ok_count) / Number(r.count)) * 100 : null,
  }));

  const totalCount = series.reduce((s, b) => s + b.count, 0);
  const okCount = series.reduce((s, b) => s + b.okCount, 0);
  const uptimePercent = totalCount > 0 ? (okCount / totalCount) * 100 : 100;

  return { range: rangeKey, bucket: bucketKey, uptimePercent, series };
}

// Ownership-safe existence check for route guards.
export async function monitorExistsForUser(monitorId: string, userId: string): Promise<boolean> {
  const rows = (await db.execute(sql`
    SELECT 1 FROM monitors WHERE id = ${monitorId} AND user_id = ${userId} LIMIT 1
  `)) as unknown as unknown[];
  return rows.length > 0;
}
