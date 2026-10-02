import { sql } from "drizzle-orm";
import { dbPostgres } from "../../database/drizzle/db";

const db = dbPostgres();

// Rollup job (REQ-015, ADR-004): aggregate raw checks into 5m/1h buckets.
// Idempotent via ON CONFLICT upsert on the unique (monitor_id, bucket_start,
// bucket_size_sec) constraint — re-running never double-counts.

export const ROLLUP_BUCKET_SIZES = [300, 3600] as const;

// Aggregate checks newer than `since` (defaults to 2h ago — overlap window so
// re-runs and late inserts converge via upsert).
export async function runRollup(since?: Date): Promise<{ buckets: number }> {
  const sinceTs = since ?? new Date(Date.now() - 2 * 3600 * 1000);

  for (const bucketSec of ROLLUP_BUCKET_SIZES) {
    await db.execute(sql`
      INSERT INTO check_rollups (monitor_id, bucket_start, bucket_size_sec, count, ok_count, p50_ms, p95_ms, p99_ms, min_ms, max_ms)
      SELECT
        monitor_id,
        bucket_start,
        ${bucketSec} AS bucket_size_sec,
        count(*) AS count,
        count(*) FILTER (WHERE ok) AS ok_count,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE ok) AS p50_ms,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE ok) AS p95_ms,
        percentile_cont(0.99) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE ok) AS p99_ms,
        min(latency_ms) FILTER (WHERE ok) AS min_ms,
        max(latency_ms) FILTER (WHERE ok) AS max_ms
      FROM (
        SELECT monitor_id, ok, latency_ms,
          to_timestamp(floor(extract(epoch FROM checked_at) / ${bucketSec}) * ${bucketSec}) AS bucket_start
        FROM checks
        WHERE checked_at >= ${sinceTs.toISOString()}
      ) bucketed
      GROUP BY monitor_id, bucket_start
      ON CONFLICT (monitor_id, bucket_start, bucket_size_sec) DO UPDATE SET
        count = EXCLUDED.count,
        ok_count = EXCLUDED.ok_count,
        p50_ms = EXCLUDED.p50_ms,
        p95_ms = EXCLUDED.p95_ms,
        p99_ms = EXCLUDED.p99_ms,
        min_ms = EXCLUDED.min_ms,
        max_ms = EXCLUDED.max_ms
    `);
  }

  const [{ total }] = (await db.execute(sql`
    SELECT count(*)::int AS total FROM check_rollups WHERE bucket_start >= ${sinceTs.toISOString()}
  `)) as unknown as [{ total: number }];
  return { buckets: total };
}
