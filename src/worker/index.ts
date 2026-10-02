// Worker entrypoint (ADR-002): claims due monitors, probes, records checks.
// M1 adds the real claim→probe→store loop. Import order matters: load .env
// before any query module touches DATABASE_URL (02 §8).
import "./env";
import { workerEnv } from "./env";
import { claimDueMonitors } from "./scheduler";
import { assertProbeTargetAllowed } from "./prober/ssrf";
import { recordCheck } from "./storage";
import { applyDebounce } from "./alerts/incidents";
import { publishCheckEvent, publishIncidentEvent } from "./events";
import { evaluateContract } from "./contract";
import { runRollup } from "./jobs/rollup";
import { runRetention } from "./jobs/retention";
import { ensurePartitions } from "./jobs/partitions";
import type { ProbeResult } from "./prober";

const env = workerEnv();
const TICK_MS = 1000;
const CLAIM_LIMIT = 20;

console.log(`[worker] boot region=${env.region} tick=${TICK_MS}ms`);

let running = true;
process.on("SIGINT", () => {
  running = false;
});
process.on("SIGTERM", () => {
  running = false;
});

async function tick(n: number): Promise<void> {
  let claimed: Awaited<ReturnType<typeof claimDueMonitors>>;
  try {
    claimed = await claimDueMonitors(CLAIM_LIMIT);
  } catch (e) {
    console.error(`[worker] tick ${n}: claim failed`, e instanceof Error ? e.message : e);
    return;
  }

  // Bounded concurrency: probe in small batches, never sequential, never unbounded (06 §11).
  const BATCH = 20;
  for (let i = 0; i < claimed.length; i += BATCH) {
    await Promise.all(claimed.slice(i, i + BATCH).map(async (monitor) => {
      try {
        const guard = await assertProbeTargetAllowed(monitor.url);
        let result: ProbeResult;
        let bodyText: string | null = null;
        if (guard.allowed) {
          // Contract probes need the body for keyword scans; fetch it directly here
          // (prober stays body-free for M1's simple success path).
          const started = performance.now();
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), monitor.timeoutMs);
          try {
            const res = await fetch(monitor.url, {
              method: monitor.method,
              signal: controller.signal,
              redirect: "follow",
              headers: { "user-agent": "Lunite/1.0 (+uptime monitor)" },
            });
            bodyText = await res.text();
            result = {
              ok: true,
              statusCode: res.status,
              ttfbMs: Math.round(performance.now() - started),
              latencyMs: Math.round(performance.now() - started),
              error: null,
            };
          } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            const timedOut = message.includes("abort") || message.includes("Timeout");
            result = {
              ok: false,
              statusCode: null,
              ttfbMs: null,
              latencyMs: Math.round(performance.now() - started),
              error: timedOut ? `timed out after ${monitor.timeoutMs}ms` : message,
            };
          } finally {
            clearTimeout(timer);
          }
        } else {
          result = { ok: false, statusCode: null, ttfbMs: null, latencyMs: null, error: guard.reason ?? "target blocked" };
        }

        const expectedKeywords = Array.isArray(monitor.expectedKeywords) ? monitor.expectedKeywords as string[] : [];
        const verdict = evaluateContract(result.ok, result.statusCode, bodyText, {
          expectedStatus: monitor.expectedStatus ?? null,
          expectedKeywords,
        });
        const outcome: ProbeResult = { ...result, ok: verdict.ok, error: verdict.error ?? result.error };
        await recordCheck(monitor.id, env.region, outcome);
        const transition = await applyDebounce(monitor, outcome.ok);
        await publishCheckEvent({
          monitorId: monitor.id,
          ok: outcome.ok,
          statusCode: outcome.statusCode,
          latencyMs: outcome.latencyMs,
          at: new Date().toISOString(),
        });
        if (transition.kind !== "none") {
          await publishIncidentEvent({
            action: transition.kind === "open" ? "opened" : "resolved",
            incidentId: transition.incidentId!,
            monitorId: monitor.id,
            at: new Date().toISOString(),
          });
          console.log(`[worker] incident ${transition.kind} for ${monitor.name} (${transition.reason})`);
        }
        console.log(`[worker] probe ${monitor.name} ok=${outcome.ok} status=${outcome.statusCode} ${outcome.error ?? ""}`);
      } catch (e) {
        // Never let one bad monitor kill the loop (04 §4).
        console.error(`[worker] probe ${monitor.name} failed hard:`, e instanceof Error ? e.message : e);
      }
    }));
  }

  if (claimed.length > 0) {
    console.log(`[worker] tick ${n}: handled ${claimed.length} monitor(s)`);
  }
}

let n = 0;
let lastRollup = 0;
let lastRetention = 0;
const ROLLUP_INTERVAL_MS = 5 * 60 * 1000;
const RETENTION_INTERVAL_MS = 60 * 60 * 1000;
// Ensure partitions at boot so early probes never hit a missing partition (REQ-041).
try {
  await ensurePartitions(2);
} catch (e) {
  console.error("[worker] partition ensure failed:", e instanceof Error ? e.message : e);
}
while (running) {
  n += 1;
  await tick(n);
  // Rollup every ~5 minutes (REQ-015); idempotent so overlap is safe.
  if (Date.now() - lastRollup >= ROLLUP_INTERVAL_MS) {
    lastRollup = Date.now();
    try {
      await runRollup();
    } catch (e) {
      console.error("[worker] rollup failed:", e instanceof Error ? e.message : e);
    }
  }
  // Retention + partition maintenance hourly (REQ-016, REQ-041).
  if (Date.now() - lastRetention >= RETENTION_INTERVAL_MS) {
    lastRetention = Date.now();
    try {
      await runRetention();
      await ensurePartitions(2);
    } catch (e) {
      console.error("[worker] retention failed:", e instanceof Error ? e.message : e);
    }
  }
  await Bun.sleep(TICK_MS);
}
console.log("[worker] stopped");
