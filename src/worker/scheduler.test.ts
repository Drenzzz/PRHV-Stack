import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { dbPostgres } from "../database/drizzle/db";
import { claimDueMonitors } from "./scheduler";import { probe } from "./prober";
import { assertProbeTargetAllowed } from "./prober/ssrf";

// TEST-006: claim race (REQ-011/036) + prober behavior (REQ-009) + SSRF guard (REQ-034).

const db = dbPostgres();

let testUserId: string;
let monitorId: string;

beforeAll(async () => {
  const rows = (await db.execute(sql`
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES ('worker-test-user', 'worker-test', 'worker-test@lunite.dev', true, now(), now())
    ON CONFLICT (id) DO UPDATE SET name = 'worker-test'
    RETURNING id
  `)) as unknown as { id: string }[];
  testUserId = rows[0].id;
});

afterAll(async () => {
  await db.execute(sql`DELETE FROM checks WHERE monitor_id = 'worker-test-mon'`);
  await db.execute(sql`DELETE FROM monitors WHERE id = 'worker-test-mon'`);
  await db.execute(sql`DELETE FROM "user" WHERE id = 'worker-test-user'`);
});

async function seedDueMonitor(): Promise<string> {
  await db.execute(sql`
    INSERT INTO monitors (id, user_id, name, url, active, next_check_at, interval_sec, timeout_ms)
    VALUES ('worker-test-mon', ${testUserId}, 'worker-test-mon', 'https://example.com', true, now(), 60, 10000)
    ON CONFLICT (id) DO UPDATE SET next_check_at = now(), active = true
  `);
  return "worker-test-mon";
}

test("claim race: two concurrent claimers never return the same monitor (REQ-011)", async () => {
  await seedDueMonitor();
  const [a, b] = await Promise.all([claimDueMonitors(50), claimDueMonitors(50)]);
  const idsA = a.map((m) => m.id);
  const idsB = b.map((m) => m.id);
  const overlap = idsA.filter((id) => idsB.includes(id));
  expect(overlap).toEqual([]);
  expect(idsA).toContain("worker-test-mon");
});

test("claimed monitor's next_check_at advanced (no immediate re-claim)", async () => {
  await db.execute(sql`UPDATE monitors SET next_check_at = now() WHERE id = 'worker-test-mon'`);
  await claimDueMonitors(50);
  const second = await claimDueMonitors(50);
  expect(second.map((m) => m.id)).not.toContain("worker-test-mon");
});

test("paused monitors are never claimed (REQ-007)", async () => {
  await db.execute(sql`UPDATE monitors SET active = false, next_check_at = now() WHERE id = 'worker-test-mon'`);
  const claimed = await claimDueMonitors(50);
  expect(claimed.map((m) => m.id)).not.toContain("worker-test-mon");
  await db.execute(sql`UPDATE monitors SET active = true, next_check_at = now() WHERE id = 'worker-test-mon'`);
});

test("prober: success against a live mock server records status + latency (REQ-009)", async () => {
  const server = Bun.serve({
    port: 0,
    fetch: () => new Response("pong", { status: 200 }),
  });
  const result = await probe(`http://localhost:${server.port}/`, 5000);
  server.stop(true);
  expect(result.ok).toBe(true);
  expect(result.statusCode).toBe(200);
  expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  expect(result.error).toBeNull();
});

test("prober: timeout → ok=false with timed-out error (REQ-009)", async () => {
  const server = Bun.serve({
    port: 0,
    fetch: async () => {
      await Bun.sleep(3000);
      return new Response("late");
    },
  });
  const result = await probe(`http://localhost:${server.port}/`, 200);
  server.stop(true);
  expect(result.ok).toBe(false);
  expect(result.error).toContain("timed out");
});

test("SSRF guard blocks loopback targets (REQ-034)", async () => {
  const blocked = await assertProbeTargetAllowed("http://127.0.0.1:9999/");
  expect(blocked.allowed).toBe(false);

  const metadata = await assertProbeTargetAllowed("http://169.254.169.254/latest/meta-data/");
  expect(metadata.allowed).toBe(false);

  const invalid = await assertProbeTargetAllowed("not a url");
  expect(invalid.allowed).toBe(false);
});

test("SSRF guard allows public targets", async () => {
  // example.com resolves publicly; no network fetch happens here, only DNS.
  const result = await assertProbeTargetAllowed("https://example.com/");
  expect(result.allowed).toBe(true);
}, 15000);
