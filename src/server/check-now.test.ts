import { expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { dbPostgres } from "../database/drizzle/db";
import { testFetch } from "../+server";
import { authed, createMonitor, signUp } from "./test-helpers";
import { claimDueMonitors } from "../worker/scheduler";

// REQ-030 (check-now) + REQ-007 (pause claim semantics), TEST-004/006.

const db = dbPostgres();

test("check-now → 202 and monitor becomes due immediately (REQ-030)", async () => {
  const user = await signUp("checknow");
  const { monitor } = await createMonitor(user, { intervalSec: 3600 });
  const id = monitor!.id;
  // Create already schedules now(); push it far into the future so only
  // check-now could have made it due.
  await db.execute(sql`UPDATE monitors SET next_check_at = now() + interval '1 hour' WHERE id = ${id}`);

  const res = await testFetch(authed("POST", `/api/monitors/${id}/check`, user));
  expect(res.status).toBe(202);

  const claimed = await claimDueMonitors(50);
  expect(claimed.map((m) => m.id)).toContain(id);
});

test("check-now on paused monitor → 409 CONFLICT (REQ-007)", async () => {
  const user = await signUp("checknow-paused");
  const { monitor } = await createMonitor(user);
  const id = monitor!.id;
  await testFetch(authed("PATCH", `/api/monitors/${id}`, user, { active: false }));

  const res = await testFetch(authed("POST", `/api/monitors/${id}/check`, user));
  expect(res.status).toBe(409);
  expect((await res.json()).code).toBe("CONFLICT");
});

test("check-now on someone else's monitor → 404 (REQ-032)", async () => {
  const owner = await signUp("checknow-owner");
  const attacker = await signUp("checknow-attacker");
  const { monitor } = await createMonitor(owner);

  const res = await testFetch(authed("POST", `/api/monitors/${monitor!.id}/check`, attacker));
  expect(res.status).toBe(404);
});

test("unauthenticated check-now → 401", async () => {
  const res = await testFetch(new Request("http://localhost/api/monitors/any-id/check", { method: "POST" }));
  expect(res.status).toBe(401);
});
