// Worker entrypoint (ADR-002): claims due monitors, probes, records checks.
// M1 adds the real claim→probe→store loop. Import order matters: load .env
// before any query module touches DATABASE_URL (02 §8).
import "./env";
import { workerEnv } from "./env";
import { claimDueMonitors } from "./scheduler";
import { assertProbeTargetAllowed } from "./prober/ssrf";
import { recordCheck, applyProbeOutcome } from "./storage";
import { evaluateContract } from "./contract";
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
        await applyProbeOutcome(monitor, outcome.ok);
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
while (running) {
  n += 1;
  await tick(n);
  await Bun.sleep(TICK_MS);
}
console.log("[worker] stopped");
