import { sql } from "drizzle-orm";
import { dbPostgres } from "../../database/drizzle/db";
import type { ClaimedMonitor } from "../scheduler";
import { nextDebounceState } from "./debounce";

const db = dbPostgres();

// Incident persistence wired to the probe pipeline (REQ-018…020).
// ≤1 open incident per monitor enforced by partial unique index (03 §4).

export interface IncidentTransition {
  kind: "open" | "resolve" | "none";
  incidentId?: string;
  reason?: string;
}

export async function applyDebounce(
  monitor: ClaimedMonitor,
  ok: boolean,
): Promise<IncidentTransition> {
  // Load rule thresholds (1 rule/monitor MVP; defaults 3/2).
  const rules = (await db.execute(sql`
    SELECT failure_threshold, recovery_threshold FROM alert_rules WHERE monitor_id = ${monitor.id} AND enabled
  `)) as unknown as Array<{ failure_threshold: number; recovery_threshold: number }>;
  const failureThreshold = rules[0] ? Number(rules[0].failure_threshold) : 3;
  const recoveryThreshold = rules[0] ? Number(rules[0].recovery_threshold) : 2;

  const open = (await db.execute(sql`
    SELECT id FROM incidents WHERE monitor_id = ${monitor.id} AND status = 'open' LIMIT 1
  `)) as unknown as Array<{ id: string }>;

  const { state, action } = nextDebounceState(
    {
      consecutiveFailures: monitor.consecutiveFailures,
      consecutiveSuccesses: monitor.consecutiveSuccesses,
      hasOpenIncident: open.length > 0,
    },
    ok,
    failureThreshold,
    recoveryThreshold,
  );

  // Persist counters + status regardless of transition.
  await db.execute(sql`
    UPDATE monitors SET
      consecutive_failures = ${state.consecutiveFailures},
      consecutive_successes = ${state.consecutiveSuccesses},
      current_status = ${ok ? "up" : "down"},
      open_incident_id = ${action.kind === "open" ? null : (open[0]?.id ?? null)}
    WHERE id = ${monitor.id}
  `);

  if (action.kind === "open") {
    const reason = `failure_threshold:${failureThreshold}`;
    // id uses gen_random_uuid() — drizzle's $defaultFn is client-side only and
    // raw SQL inserts bypass it.
    const created = (await db.execute(sql`
      INSERT INTO incidents (id, monitor_id, status, reason)
      VALUES (gen_random_uuid(), ${monitor.id}, 'open', ${reason})
      RETURNING id
    `)) as unknown as Array<{ id: string }>;
    const incidentId = created[0].id;
    await db.execute(sql`UPDATE monitors SET open_incident_id = ${incidentId} WHERE id = ${monitor.id}`);
    return { kind: "open", incidentId, reason };
  }

  if (action.kind === "resolve") {
    const incidentId = open[0].id;
    await db.execute(sql`
      UPDATE incidents SET status = 'resolved', ended_at = now(), reason = 'recovered'
      WHERE id = ${incidentId}
    `);
    await db.execute(sql`UPDATE monitors SET open_incident_id = NULL WHERE id = ${monitor.id}`);
    return { kind: "resolve", incidentId, reason: "recovered" };
  }

  return { kind: "none" };
}
