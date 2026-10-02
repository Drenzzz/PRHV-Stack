// Worker entrypoint (ADR-002): claims due monitors, probes, runs jobs, sends alerts.
// M0 = skeleton only: validate env, log ticks. Probe/claim logic lands in M1.
// Import order matters: load .env before any query module touches DATABASE_URL (02 §8).
import "./env";
import { workerEnv } from "./env";

const env = workerEnv();
const TICK_MS = 1000;

console.log(`[worker] boot region=${env.region} tick=${TICK_MS}ms`);

let running = true;
process.on("SIGINT", () => {
  running = false;
});
process.on("SIGTERM", () => {
  running = false;
});

function tick(n: number) {
  // ponytail: skeleton heartbeat; claim loop replaces this in M1 (src/worker/scheduler.ts)
  console.log(`[worker] tick ${n}`);
}

let n = 0;
while (running) {
  n += 1;
  tick(n);
  await Bun.sleep(TICK_MS);
}
console.log("[worker] stopped");
