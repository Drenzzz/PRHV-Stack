// Worker entrypoint (ADR-002): claims due monitors, probes, records checks.
// M1 adds the real claim→probe→store loop. Import order matters: load .env
// before any query module touches DATABASE_URL (02 §8).
import "./env";
import { workerEnv } from "./env";
import { claimDueMonitors } from "./scheduler";
import { probe } from "./prober";
import { assertProbeTargetAllowed } from "./prober/ssrf";
import { recordCheck } from "./storage";

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
        const result = guard.allowed
          ? await probe(monitor.url, monitor.timeoutMs)
          : { ok: false, statusCode: null, ttfbMs: null, latencyMs: null, error: guard.reason ?? "target blocked" };
        await recordCheck(monitor.id, env.region, result);
        console.log(`[worker] probe ${monitor.name} ok=${result.ok} status=${result.statusCode} ${result.error ?? ""}`);
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
