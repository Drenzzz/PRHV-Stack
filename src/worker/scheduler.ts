import { sql } from "drizzle-orm";
import { dbPostgres } from "../database/drizzle/db";
import { monitors } from "../database/drizzle/schema/monitors";

const db = dbPostgres();

// Atomic due-job claim (REQ-011, ADR-003): one statement advances next_check_at
// and returns the claimed rows. Concurrent workers never claim the same row —
// SKIP LOCKED skips rows locked by other transactions. Short transactions mean
// a crashed worker leaves no stuck locks (REQ-036).
// Worker-side monitor row shape: `RETURNING *` gives snake_case DB columns,
// not Drizzle's camelCase mapping. Keep this aligned with the `monitors` schema.
export interface ClaimedMonitor {
  id: string;
  userId: string;
  name: string;
  url: string;
  method: string;
  intervalSec: number;
  timeoutMs: number;
  active: boolean;
  nextCheckAt: string | null;
  currentStatus: string;
  expectedStatus: number | null;
  expectedKeywords: unknown;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  sslCheck: boolean;
  sslExpiresAt: string | null;
}

export async function claimDueMonitors(limit = 20): Promise<ClaimedMonitor[]> {
  const result = await db.execute(sql`
    UPDATE monitors
    SET next_check_at = now() + (interval_sec * interval '1 second')
    WHERE id IN (
      SELECT id FROM monitors
      WHERE active AND next_check_at <= now()
      ORDER BY next_check_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, user_id AS "userId", name, url, method, interval_sec AS "intervalSec",
              timeout_ms AS "timeoutMs", active, next_check_at AS "nextCheckAt", current_status AS "currentStatus",
              expected_status AS "expectedStatus", expected_keywords AS "expectedKeywords",
              consecutive_failures AS "consecutiveFailures", consecutive_successes AS "consecutiveSuccesses",
              ssl_check AS "sslCheck", ssl_expires_at AS "sslExpiresAt";
  `);
  return result as unknown as ClaimedMonitor[];
}

export async function claimMonitorNow(userId: string, id: string): Promise<boolean> {
  // Manual "check now" (REQ-030): set due immediately; the next tick claims it.
  const result = await db
    .update(monitors)
    .set({ nextCheckAt: new Date() })
    .where(sql`${monitors.id} = ${id} AND ${monitors.userId} = ${userId} AND ${monitors.active}`)
    .returning({ id: monitors.id });
  return result.length > 0;
}

// Inverse claim filter for pause semantics (REQ-007) is inherent: active=false
// rows never match the claim WHERE clause, so paused monitors are never probed.
