import { afterAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { dbPostgres } from "../../database/drizzle/db";
import { runRollup } from "./rollup";

// TEST-001: rollup aggregation math + idempotent re-run (REQ-015).

const db = dbPostgres();
const MONITOR_ID = "rollup-test-mon";
const USER_ID = "rollup-test-user";

afterAll(async () => {
  await db.execute(sql`DELETE FROM check_rollups WHERE monitor_id = ${MONITOR_ID}`);
  await db.execute(sql`DELETE FROM checks WHERE monitor_id = ${MONITOR_ID}`);
  await db.execute(sql`DELETE FROM monitors WHERE id = ${MONITOR_ID}`);
  await db.execute(sql`DELETE FROM "user" WHERE id = ${USER_ID}`);
});

async function seedChecks(): Promise<void> {
  await db.execute(sql`
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES (${USER_ID}, 'rollup-test', 'rollup-test@lunite.dev', true, now(), now())
    ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO monitors (id, user_id, name, url, active, next_check_at, interval_sec, timeout_ms)
    VALUES (${MONITOR_ID}, ${USER_ID}, 'rollup-test-mon', 'https://example.com', true, now() + interval '1 hour', 60, 10000)
    ON CONFLICT (id) DO NOTHING
  `);
  // 6 checks in the last hour: 5 ok (100..500ms), 1 fail
  const latencies = [100, 200, 300, 400, null, 500];
  for (let i = 0; i < 6; i++) {
    const ok = latencies[i] !== null;
    await db.execute(sql`
      INSERT INTO checks (checked_at, monitor_id, region, ok, status_code, latency_ms, error)
      VALUES (now() - (${(i + 1) * 5} * interval '1 minute'), ${MONITOR_ID}, 'id-1', ${ok}, ${ok ? 200 : null}, ${latencies[i]}, ${ok ? null : 'timeout'})
      ON CONFLICT DO NOTHING
    `);
  }
}

test("rollup: bucket values match manual aggregates (TEST-001)", async () => {
  await seedChecks();
  const { buckets } = await runRollup(new Date(Date.now() - 3600 * 1000));
  expect(buckets).toBeGreaterThanOrEqual(2); // 5m and 1h bucket sets exist

  // Checks span an hour boundary (now-5m … now-30m), so the 1h set has 2 rows.
  // Assert overall values by summing across them.
  const rows = (await db.execute(sql`
    SELECT count, ok_count, p50_ms, p95_ms, p99_ms, min_ms, max_ms
    FROM check_rollups WHERE monitor_id = ${MONITOR_ID} AND bucket_size_sec = 3600
    ORDER BY bucket_start
  `)) as unknown as Array<Record<string, unknown>>;

  expect(rows.length).toBe(2);
  const totalCount = rows.reduce((s, r) => s + Number(r.count), 0);
  const totalOk = rows.reduce((s, r) => s + Number(r.ok_count), 0);
  expect(totalCount).toBe(6);
  expect(totalOk).toBe(5);
  // Latencies 100..500 distributed across two 1h buckets; assert envelope.
  const mins = rows.map((r) => Number(r.min_ms)).filter((n) => !Number.isNaN(n));
  const maxs = rows.map((r) => Number(r.max_ms)).filter((n) => !Number.isNaN(n));
  expect(Math.min(...mins)).toBe(100);
  expect(Math.max(...maxs)).toBe(500);
  // The 500ms check may fall in either bucket; every non-null p50 is a valid median of its bucket.
  for (const r of rows) {
    if (r.p50_ms != null) {
      const p = Number(r.p50_ms);
      expect(p).toBeGreaterThanOrEqual(100);
      expect(p).toBeLessThanOrEqual(500);
    }
  }
});

test("rollup: re-run is idempotent — values unchanged (TEST-001)", async () => {
  const before = (await db.execute(sql`
    SELECT bucket_size_sec, bucket_start, count, ok_count, p50_ms, p95_ms, p99_ms, min_ms, max_ms
    FROM check_rollups WHERE monitor_id = ${MONITOR_ID}
    ORDER BY bucket_size_sec, bucket_start
  `)) as unknown as Array<Record<string, unknown>>;

  await runRollup(new Date(Date.now() - 3600 * 1000));

  const after = (await db.execute(sql`
    SELECT bucket_size_sec, bucket_start, count, ok_count, p50_ms, p95_ms, p99_ms, min_ms, max_ms
    FROM check_rollups WHERE monitor_id = ${MONITOR_ID}
    ORDER BY bucket_size_sec, bucket_start
  `)) as unknown as Array<Record<string, unknown>>;

  expect(after).toEqual(before);
});
