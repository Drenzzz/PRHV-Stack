import { afterAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { dbPostgres } from "../../database/drizzle/db";
import { runRetention, RAW_RETENTION_DAYS } from "./retention";
import { ensurePartitions } from "./partitions";

// REQ-016 (retention) + REQ-041 (partition pre-creation).

const db = dbPostgres();
const MONITOR_ID = "retention-test-mon";
const USER_ID = "retention-test-user";

afterAll(async () => {
  await db.execute(sql`DELETE FROM checks WHERE monitor_id = ${MONITOR_ID}`);
  await db.execute(sql`DELETE FROM monitors WHERE id = ${MONITOR_ID}`);
  await db.execute(sql`DELETE FROM "user" WHERE id = ${USER_ID}`);
});

async function seedAgedRows(): Promise<void> {
  // 10 days ago is outside current partitions — create it first (REQ-041 job).
  await ensurePartitions(2);
  await db.execute(sql`
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES (${USER_ID}, 'retention-test', 'retention-test@lunite.dev', true, now(), now())
    ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO monitors (id, user_id, name, url, active, next_check_at, interval_sec, timeout_ms)
    VALUES (${MONITOR_ID}, ${USER_ID}, 'retention-test-mon', 'https://example.com', true, now() + interval '1 hour', 60, 10000)
    ON CONFLICT (id) DO NOTHING
  `);
  // One check 10 days old (must be deleted), one fresh (must survive).
  await db.execute(sql`
    INSERT INTO checks (checked_at, monitor_id, region, ok, status_code, latency_ms)
    VALUES (now() - (${RAW_RETENTION_DAYS + 3} * interval '1 day'), ${MONITOR_ID}, 'id-1', true, 200, 100)
    ON CONFLICT DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO checks (checked_at, monitor_id, region, ok, status_code, latency_ms)
    VALUES (now(), ${MONITOR_ID}, 'id-1', true, 200, 120)
    ON CONFLICT DO NOTHING
  `);
}

test("retention: rows older than 7 days deleted, fresh rows survive (REQ-016)", async () => {
  await seedAgedRows();
  await runRetention();

  const stale = (await db.execute(sql`
    SELECT count(*) AS c FROM checks WHERE monitor_id = ${MONITOR_ID} AND checked_at < now() - (${RAW_RETENTION_DAYS} * interval '1 day')
  `)) as unknown as [{ c: number }];
  expect(Number(stale[0].c)).toBe(0);

  const fresh = (await db.execute(sql`
    SELECT count(*) AS c FROM checks WHERE monitor_id = ${MONITOR_ID} AND checked_at >= now() - (1 * interval '1 hour')
  `)) as unknown as [{ c: number }];
  expect(Number(fresh[0].c)).toBe(1);
});

test("partitions: past/current/future months exist, insert into next month succeeds (REQ-041)", async () => {
  const created = await ensurePartitions(2);
  expect(created.length).toBe(4); // previous + current + 2 ahead

  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 15, 12));
  // Insert directly into the next month's window.
  await db.execute(sql`
    INSERT INTO checks (checked_at, monitor_id, region, ok, status_code, latency_ms)
    VALUES (${next.toISOString()}, ${MONITOR_ID}, 'id-1', true, 200, 90)
    ON CONFLICT DO NOTHING
  `);
  const rows = (await db.execute(sql`
    SELECT count(*) AS c FROM checks WHERE monitor_id = ${MONITOR_ID} AND checked_at >= ${next.toISOString()}
  `)) as unknown as [{ c: number }];
  expect(Number(rows[0].c)).toBe(1);
});
