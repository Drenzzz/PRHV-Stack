import { sql } from "drizzle-orm";
import { dbPostgres } from "../database/drizzle/db";
import type { ProbeResult } from "./prober";

const db = dbPostgres();

// Persist one probe outcome (REQ-012). Checks land in the monthly partition
// matching checked_at (verified by the M0 partition smoke tests).
export async function recordCheck(
  monitorId: string,
  region: string,
  result: ProbeResult,
  checkedAt: Date = new Date(),
): Promise<void> {
  await db.execute(sql`
    INSERT INTO checks (checked_at, monitor_id, region, ok, status_code, ttfb_ms, latency_ms, error)
    VALUES (${checkedAt.toISOString()}, ${monitorId}, ${region}, ${result.ok}, ${result.statusCode}, ${result.ttfbMs}, ${result.latencyMs}, ${result.error})
  `);
}
