import { afterAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { testFetch } from "../+server";
import { dbPostgres } from "../database/drizzle/db";
import { authed, createMonitor, signUp } from "./test-helpers";

// TEST-004: monitor CRUD + ownership matrix (REQ-005..008, REQ-032).
const db = dbPostgres();

afterAll(async () => {
  // Tests create real users/monitors; sweep them so repeated runs stay clean.
  await db.execute(sql`DELETE FROM monitors WHERE user_id IN (SELECT id FROM "user" WHERE email LIKE '%@test.lunite.dev')`);
  await db.execute(sql`DELETE FROM "user" WHERE email LIKE '%@test.lunite.dev'`);
});

test("unauthenticated monitor list → 401 with taxonomy code", async () => {
  const res = await testFetch(new Request("http://localhost/api/monitors"));
  expect(res.status).toBe(401);
  const body = await res.json();
  expect(body.code).toBe("UNAUTHENTICATED");
});

test("create monitor → 201, scheduled immediately (CF-010 default)", async () => {
  const user = await signUp("cr");
  const { status, monitor } = await createMonitor(user, { intervalSec: 30 });
  expect(status).toBe(201);
  expect(monitor!.active).toBe(true);
  expect(monitor!.intervalSec).toBe(30);
  expect(monitor!.nextCheckAt).toBeTruthy();

});

test("invalid body → 422 VALIDATION with fields", async () => {
  const user = await signUp("inv");
  const res = await testFetch(authed("POST", "/api/monitors", user, {
    name: "",
    url: "ftp://nope",
    intervalSec: 5,
  }));
  expect(res.status).toBe(422);
  const body = await res.json();
  expect(body.code).toBe("VALIDATION");
  expect(body.fields.length).toBeGreaterThan(0);
});

test("cross-user access → 404 without data leak (REQ-032)", async () => {
  const owner = await signUp("owner");
  const attacker = await signUp("attacker");
  const { monitor } = await createMonitor(owner);
  const id = monitor!.id;

  const get = await testFetch(authed("GET", `/api/monitors/${id}`, attacker));
  expect(get.status).toBe(404);
  const getBody = await get.json();
  expect(getBody.code).toBe("NOT_FOUND");
  expect(JSON.stringify(getBody)).not.toContain("Test monitor");

  const patch = await testFetch(authed("PATCH", `/api/monitors/${id}`, attacker, { name: "hax" }));
  expect(patch.status).toBe(404);

  const del = await testFetch(authed("DELETE", `/api/monitors/${id}`, attacker));
  expect(del.status).toBe(404);

  // Owner still sees it — nothing was touched.
  const ownerGet = await testFetch(authed("GET", `/api/monitors/${id}`, owner));
  expect(ownerGet.status).toBe(200);
});

test("list returns only caller's monitors (REQ-006)", async () => {
  const a = await signUp("lista");
  const b = await signUp("listb");
  const ma = await createMonitor(a);
  const mb = await createMonitor(b);


  const listA = await (await testFetch(authed("GET", "/api/monitors", a))).json();
  const listB = await (await testFetch(authed("GET", "/api/monitors", b))).json();
  expect(listA.monitors.map((m: { id: string }) => m.id)).toContain(ma.monitor!.id);
  expect(listA.monitors.map((m: { id: string }) => m.id)).not.toContain(mb.monitor!.id);
  expect(listB.monitors.map((m: { id: string }) => m.id)).toContain(mb.monitor!.id);
});

test("pause/resume flips active and next_check_at (REQ-007)", async () => {
  const user = await signUp("pause");
  const { monitor } = await createMonitor(user);
  const id = monitor!.id;


  const paused = await (await testFetch(authed("PATCH", `/api/monitors/${id}`, user, { active: false }))).json();
  expect(paused.monitor.active).toBe(false);
  expect(paused.monitor.nextCheckAt).toBeNull();

  const resumed = await (await testFetch(authed("PATCH", `/api/monitors/${id}`, user, { active: true }))).json();
  expect(resumed.monitor.active).toBe(true);
  expect(resumed.monitor.nextCheckAt).toBeTruthy();
});

test("delete → 204, then 404 (REQ-008)", async () => {
  const user = await signUp("del");
  const { monitor } = await createMonitor(user);
  const id = monitor!.id;

  const del = await testFetch(authed("DELETE", `/api/monitors/${id}`, user));
  expect(del.status).toBe(204);

  const get = await testFetch(authed("GET", `/api/monitors/${id}`, user));
  expect(get.status).toBe(404);
});

test("21st monitor is rejected (OQ-005 cap)", async () => {
  const user = await signUp("cap");
  for (let i = 0; i < 20; i++) {
    const { status } = await createMonitor(user, { name: `m${i}` });
    expect(status).toBe(201);
  }
  const { status, body } = await createMonitor(user, { name: "m21" });
  expect(status).toBe(409);
  expect((body as { code: string }).code).toBe("CONFLICT");
}, 30000);
