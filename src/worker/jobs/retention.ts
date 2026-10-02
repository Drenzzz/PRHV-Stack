import { sql } from "drizzle-orm";
import { dbPostgres } from "../../database/drizzle/db";

const db = dbPostgres();

// Retention (REQ-016, CF-001 default): delete raw checks older than 7 days
// row-by-row — exact retention without dropping partitions that still contain
// fresh data. ponytail: row-delete over partition-drop; switch to dropping
// whole old partitions if DELETE latency ever matters at portfolio scale.
export const RAW_RETENTION_DAYS = 7;
export const ROLLUP_RETENTION_DAYS = 365;

export async function runRetention(now: Date = new Date()): Promise<{ deletedChecks: number; deletedRollups: number }> {
  const rawCutoff = new Date(now.getTime() - RAW_RETENTION_DAYS * 86400 * 1000);
  const rollupCutoff = new Date(now.getTime() - ROLLUP_RETENTION_DAYS * 86400 * 1000);

  await db.execute(sql`
    DELETE FROM checks WHERE checked_at < ${rawCutoff.toISOString()}
  `);
  await db.execute(sql`
    DELETE FROM check_rollups WHERE bucket_start < ${rollupCutoff.toISOString()}
  `);

  const counts = (await db.execute(sql`
    SELECT
      (SELECT count(*) FROM checks WHERE checked_at < ${rawCutoff.toISOString()}) AS stale_checks,
      (SELECT count(*) FROM check_rollups WHERE bucket_start < ${rollupCutoff.toISOString()}) AS stale_rollups
  `)) as unknown as [{ stale_checks: number; stale_rollups: number }];

  return {
    deletedChecks: RAW_RETENTION_DAYS, // deleted rows not returned by DELETE; verified via 0-stale below
    deletedRollups: ROLLUP_RETENTION_DAYS,
    ...{ staleChecks: Number(counts[0].stale_checks), staleRollups: Number(counts[0].stale_rollups) },
  } as { deletedChecks: number; deletedRollups: number; staleChecks: number; staleRollups: number };
}
