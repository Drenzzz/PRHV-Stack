import { sql } from "drizzle-orm";
import { dbPostgres } from "../database/drizzle/db";
import { monitors } from "../database/drizzle/schema/monitors";
import type { ProbeResult } from "./prober";
import type { ClaimedMonitor } from "./scheduler";

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

// Update monitor state after a contract verdict (03 §4). Debounce counters
// track the current streak; incident open/resolve lands in M2 (Step 2.4).
export async function applyProbeOutcome(monitor: ClaimedMonitor, ok: boolean): Promise<void> {
  await db
    .update(monitors)
    .set({
      currentStatus: ok ? "up" : "down",
      consecutiveFailures: ok ? sql`0` : sql`${monitors.consecutiveFailures} + 1`,
      consecutiveSuccesses: ok ? sql`${monitors.consecutiveSuccesses} + 1` : sql`0`,
    })
    .where(sql`${monitors.id} = ${monitor.id}`);
}
