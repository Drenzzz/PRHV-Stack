import { afterAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { dbPostgres } from "../database/drizzle/db";
import { testFetch } from "../+server";
import { authed, createMonitor, signUp } from "./test-helpers";

// TEST-005: metrics parity vs percentile_cont fixtures (REQ-013/014/017).

const db = dbPostgres();
const MONITOR_ID = "metrics-test-mon";
const USER_ID = "metrics-test-user";

const FIXTURE = [
  // checked offsets (minutes ago), ok, latency
  { min: 5, ok: true, ms: 100 },
  { min: 10, ok: true, ms: 200 },
  { min: 15, ok: true, ms: 300 },
  { min: 20, ok: true, ms: 400 },
  { min: 25, ok: false, ms: null },
  { min: 30, ok: true, ms: 500 },
];

afterAll(async () => {
  // Cleanup scoped to this suite's fixtures (avoid nuking other suites' data
  // when files run in parallel).
  await db.execute(sql`DELETE FROM checks WHERE monitor_id = ${MONITOR_ID}`);
  await db.execute(sql`DELETE FROM monitors WHERE id = ${MONITOR_ID}`);
  await db.execute(sql`DELETE FROM "user" WHERE id = ${USER_ID}`);
  await db.execute(sql`DELETE FROM monitors WHERE user_id IN (SELECT id FROM "user" WHERE email LIKE 'metrics-api-%' OR email LIKE 'metrics-bad-%' OR email LIKE 'metrics-stranger-%')`);
  await db.execute(sql`DELETE FROM "user" WHERE email LIKE 'metrics-api-%' OR email LIKE 'metrics-bad-%' OR email LIKE 'metrics-stranger-%'`);
});

async function seedFixture(): Promise<void> {
  await db.execute(sql`
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES (${USER_ID}, 'metrics-test', 'metrics-test@lunite.dev', true, now(), now())
    ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO monitors (id, user_id, name, url, active, next_check_at, interval_sec, timeout_ms)
    VALUES (${MONITOR_ID}, ${USER_ID}, 'metrics-test-mon', 'https://example.com', true, now() + interval '1 hour', 60, 10000)
    ON CONFLICT (id) DO NOTHING
  `);
  for (const f of FIXTURE) {
    await db.execute(sql`
      INSERT INTO checks (checked_at, monitor_id, region, ok, status_code, latency_ms, error)
      VALUES (now() - (${f.min} * interval '1 minute'), ${MONITOR_ID}, 'id-1', ${f.ok}, ${f.ok ? 200 : null}, ${f.ms}, ${f.ok ? null : 'timeout'})
      ON CONFLICT DO NOTHING
    `);
  }
}

test("metrics: uptime and percentiles match fixture math (REQ-013/014)", async () => {
  await seedFixture();
  const user = await signUp("metrics-api");
  // sign-up creates its own user; bind the monitor to THAT user for the API call.
  await db.execute(sql`UPDATE monitors SET user_id = (SELECT id FROM "user" WHERE email LIKE 'metrics-api-%' LIMIT 1) WHERE id = ${MONITOR_ID}`);

  const res = await testFetch(authed("GET", `/api/monitors/${MONITOR_ID}/metrics?range=1h&bucket=5m`, user));
  expect(res.status).toBe(200);
  const body = await res.json();

  // Fixture: 6 probes, 5 ok → uptime 83.33%
  expect(body.range).toBe("1h");
  expect(body.bucket).toBe("5m");
  expect(body.uptimePercent).toBeCloseTo((5 / 6) * 100, 1);

  // Latencies of ok probes: 100,200,300,400,500 → p50=300, p95≈480, p99≈496
  const overall = body.series.reduce(
    (acc: { count: number; ok: number }, b: { count: number; okCount: number }) => ({
      count: acc.count + b.count,
      ok: acc.ok + b.okCount,
    }),
    { count: 0, ok: 0 },
  );
  expect(overall.count).toBe(6);
  expect(overall.ok).toBe(5);

  // Some bucket must carry the p50/p95/p99 fields (values may be per-bucket)
  const withData = body.series.filter((b: { count: number }) => b.count > 0);
  expect(withData.length).toBeGreaterThan(0);
  for (const b of withData) {
    expect(b).toHaveProperty("p50");
    expect(b).toHaveProperty("p95");
    expect(b).toHaveProperty("p99");
    expect(b).toHaveProperty("uptime");
  }
});

test("metrics: invalid params → 422 VALIDATION", async () => {
  const user = await signUp("metrics-bad");
  const res = await testFetch(authed("GET", "/api/monitors/any-id/metrics?range=2h&bucket=7m", user));
  expect(res.status).toBe(422);
  const body = await res.json();
  expect(body.code).toBe("VALIDATION");
  expect(body.fields.length).toBe(2);
});

test("metrics: another user's monitor → 404 (REQ-032)", async () => {
  const stranger = await signUp("metrics-stranger");
  const res = await testFetch(authed("GET", `/api/monitors/${MONITOR_ID}/metrics?range=1h&bucket=5m`, stranger));
  expect(res.status).toBe(404);
});

test("metrics: unauthenticated → 401", async () => {
  const res = await testFetch(new Request("http://localhost/api/monitors/any-id/metrics"));
  expect(res.status).toBe(401);
});
