import { afterAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { dbPostgres } from "../database/drizzle/db";
import { testFetch } from "../+server";
import { authed, signUp } from "./test-helpers";
import { applyDebounce } from "../worker/alerts/incidents";

// TEST-002 (persistence) + REQ-020 (timeline API).

const db = dbPostgres();
const MONITOR_ID = "incident-test-mon";
const MONITOR_ID_2 = "incident-test-mon2";
const USER_ID = "incident-test-user";

afterAll(async () => {
  await db.execute(sql`DELETE FROM incidents WHERE monitor_id IN (${MONITOR_ID}, ${MONITOR_ID_2})`);
  await db.execute(sql`DELETE FROM checks WHERE monitor_id IN (${MONITOR_ID}, ${MONITOR_ID_2})`);
  await db.execute(sql`DELETE FROM monitors WHERE id IN (${MONITOR_ID}, ${MONITOR_ID_2})`);
  await db.execute(sql`DELETE FROM "user" WHERE id = ${USER_ID}`);
});

async function seed(): Promise<{ userId: string; user: ReturnType<typeof signUp> extends Promise<infer U> ? U : never }> {
  const user = await signUp("incident-api");
  await db.execute(sql`
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES (${USER_ID}, 'incident-test', 'incident-test@lunite.dev', true, now(), now())
    ON CONFLICT (id) DO NOTHING
  `);
  // Point both monitors at the freshly signed-up user (unique per seed call).
  const signedId = (await db.execute(sql`SELECT id FROM "user" WHERE email = ${user.email}`)) as unknown as [{ id: string }];
  const ownerId = signedId[0].id;
  for (const id of [MONITOR_ID, MONITOR_ID_2]) {
    await db.execute(sql`
      INSERT INTO monitors (id, user_id, name, url, active, interval_sec, timeout_ms)
      VALUES (${id}, ${ownerId}, ${id}, 'https://example.com', true, 60, 10000)
      ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id
    `);
  }
  return { userId: ownerId, user };
}

function claimed(id: string) {
  return {
    id, userId: USER_ID, name: id, url: "https://example.com", method: "GET",
    intervalSec: 60, timeoutMs: 10000, active: true, nextCheckAt: null,
    currentStatus: "unknown", expectedStatus: null, expectedKeywords: [],
    consecutiveFailures: 0, consecutiveSuccesses: 0,
    sslCheck: false,
    sslExpiresAt: null,
  };
}

test("3 failures open one incident; 2 successes resolve it (REQ-018/019)", async () => {
  await seed();
  const m = claimed(MONITOR_ID);

  // Two failures: no incident.
  await applyDebounce(m, false);
  const t2 = await applyDebounce(m, false);
  expect(t2.kind).toBe("none");

  // Third failure: open.
  const t3 = await applyDebounce({ ...m, consecutiveFailures: 2 }, false);
  expect(t3.kind).toBe("open");
  expect(t3.incidentId).toBeTruthy();

  // Fourth failure while open: no second incident.
  const t4 = await applyDebounce({ ...m, consecutiveFailures: 3, consecutiveSuccesses: 0 }, false);
  expect(t4.kind).toBe("none");

  // One success: still open.
  const t5 = await applyDebounce({ ...m, consecutiveFailures: 3, consecutiveSuccesses: 0 }, true);
  expect(t5.kind).toBe("none");

  // Second success: resolve.
  const t6 = await applyDebounce({ ...m, consecutiveFailures: 0, consecutiveSuccesses: 1 }, true);
  expect(t6.kind).toBe("resolve");

  const rows = (await db.execute(sql`
    SELECT status, reason FROM incidents WHERE monitor_id = ${MONITOR_ID} ORDER BY started_at
  `)) as unknown as Array<{ status: string; reason: string }>;
  expect(rows.length).toBe(1);
  expect(rows[0].status).toBe("resolved");
  expect(rows[0].reason).toBe("recovered");
});

test("timeline API: per-monitor and account-wide, ownership scoped (REQ-020)", async () => {
  const { user } = await seed();

  // Drive an incident on monitor 2 directly through the debounce path.
  const m2 = { ...claimed(MONITOR_ID_2), consecutiveFailures: 2 };
  await applyDebounce(claimed(MONITOR_ID_2), false);
  const t3 = await applyDebounce(m2, false);
  expect(t3.kind).toBe("open");

  const perMon = await testFetch(authed("GET", `/api/monitors/${MONITOR_ID_2}/incidents`, user));
  expect(perMon.status).toBe(200);
  const perMonBody = await perMon.json();
  expect(perMonBody.incidents.length).toBeGreaterThanOrEqual(1);

  const all = await testFetch(authed("GET", "/api/incidents", user));
  expect(all.status).toBe(200);
  const allBody = await all.json();
  expect(allBody.incidents.length).toBeGreaterThanOrEqual(1);

  // Another user sees nothing — 404 without data leak.
  const stranger = await signUp("incident-stranger");
  const strangerRes = await testFetch(authed("GET", `/api/monitors/${MONITOR_ID_2}/incidents`, stranger));
  expect(strangerRes.status).toBe(404);
});
