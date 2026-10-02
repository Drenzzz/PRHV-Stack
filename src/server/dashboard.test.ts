import { afterAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { dbPostgres } from "../database/drizzle/db";
import { testFetch } from "../+server";
import { authed, createMonitor, signUp } from "./test-helpers";

// STEP-M3-01: list enrichment (status/lastLatencyMs/uptime30d) + daily uptime
// series (REQ-023).

const db = dbPostgres();

afterAll(async () => {
  await db.execute(sql`DELETE FROM checks WHERE monitor_id IN (SELECT id FROM monitors WHERE user_id IN (SELECT id FROM "user" WHERE email LIKE 'm3-%@test.lunite.dev'))`);
  await db.execute(sql`DELETE FROM check_rollups WHERE monitor_id IN (SELECT id FROM monitors WHERE user_id IN (SELECT id FROM "user" WHERE email LIKE 'm3-%@test.lunite.dev'))`);
  await db.execute(sql`DELETE FROM monitors WHERE user_id IN (SELECT id FROM "user" WHERE email LIKE 'm3-%@test.lunite.dev')`);
  await db.execute(sql`DELETE FROM "user" WHERE email LIKE 'm3-%@test.lunite.dev'`);
});

test("list returns status, lastLatencyMs, uptime30d (additive)", async () => {
  const user = await signUp("m3-list");
  const { monitor } = await createMonitor(user, { name: "m3-enriched" });
  const id = monitor!.id;

  // Two ok probes so the derived fields have something to read.
  await db.execute(sql`
    INSERT INTO checks (checked_at, monitor_id, region, ok, status_code, latency_ms)
    VALUES (now() - interval '1 minute', ${id}, 'id-1', true, 200, 42),
           (now(), ${id}, 'id-1', true, 200, 55)
    ON CONFLICT DO NOTHING
  `);

  const res = await testFetch(authed("GET", "/api/monitors", user));
  expect(res.status).toBe(200);
  const body = await res.json();
  const row = body.monitors.find((m: { id: string }) => m.id === id);

  expect(row).toBeTruthy();
  // Additive: original fields must still be there (no breaking change).
  expect(row.name).toBe("m3-enriched");
  expect(row).toHaveProperty("active");
  expect(row).toHaveProperty("currentStatus");
  // New derived fields.
  expect(row.lastLatencyMs).toBe(55);
  // No rollups for this monitor yet → uptime30d is null, not 0.
  expect(row.uptime30d).toBeNull();
});

test("uptime-daily returns one cell per requested day with null for no-data days", async () => {
  const user = await signUp("m3-daily");
  const { monitor } = await createMonitor(user, { name: "m3-daily-mon" });
  const id = monitor!.id;

  // Rollup a known bucket so one day has data.
  await db.execute(sql`
    INSERT INTO check_rollups (monitor_id, bucket_start, bucket_size_sec, count, ok_count)
    VALUES (${id}, date_trunc('day', now()) + interval '1 hour', 3600, 10, 9)
    ON CONFLICT (monitor_id, bucket_start, bucket_size_sec) DO UPDATE SET count = 10, ok_count = 9
  `);

  const res = await testFetch(authed("GET", `/api/monitors/${id}/uptime-daily?days=30`, user));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.days).toBe(30);
  expect(body.series.length).toBe(30);

  const today = body.series[body.series.length - 1];
  expect(today.uptime).toBe(90); // 9/10
  expect(today.count).toBe(10);

  // Days without data carry null (rendered neutral), not 0.
  const noData = body.series.filter((c: { uptime: number | null }) => c.uptime === null);
  expect(noData.length).toBe(29);
});

test("uptime-daily validates days param → 422", async () => {
  const user = await signUp("m3-daily-bad");
  const { monitor } = await createMonitor(user);
  const res = await testFetch(authed("GET", `/api/monitors/${monitor!.id}/uptime-daily?days=0`, user));
  expect(res.status).toBe(422);
  expect((await res.json()).code).toBe("VALIDATION");
});

test("another user's monitor → 404 on both new endpoints (REQ-032)", async () => {
  const owner = await signUp("m3-own");
  const stranger = await signUp("m3-str");
  const { monitor } = await createMonitor(owner);
  const id = monitor!.id;

  const a = await testFetch(authed("GET", `/api/monitors/${id}/uptime-daily`, stranger));
  expect(a.status).toBe(404);
});

test("unauthenticated → 401", async () => {
  expect((await testFetch(new Request("http://localhost/api/monitors/any/uptime-daily"))).status).toBe(401);
});
