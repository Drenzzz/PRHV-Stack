import { afterAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { dbPostgres } from "../database/drizzle/db";
import { testFetch } from "../+server";
import { authed, createMonitor, signUp } from "./test-helpers";

// TEST-M4-KEYS: API keys (REQ-025) — secret once, read-only bearer, revoke,
// ownership. Write routes stay session-only (05 §4.1).

const db = dbPostgres();

afterAll(async () => {
  const users = `(SELECT id FROM "user" WHERE email LIKE 'key-%@test.lunite.dev')`;
  const owned = `(SELECT id FROM monitors WHERE user_id IN ${users})`;
  await db.execute(sql.raw(`DELETE FROM checks WHERE monitor_id IN ${owned}`));
  await db.execute(sql.raw(`DELETE FROM check_rollups WHERE monitor_id IN ${owned}`));
  await db.execute(sql.raw(`DELETE FROM incidents WHERE monitor_id IN ${owned}`));
  await db.execute(sql.raw(`DELETE FROM monitors WHERE user_id IN ${users}`));
  await db.execute(sql.raw(`DELETE FROM api_keys WHERE user_id IN ${users}`));
  await db.execute(sql.raw(`DELETE FROM "user" WHERE email LIKE 'key-%@test.lunite.dev'`));
});

test("create key → secret shown once; list never contains it (REQ-025)", async () => {
  const user = await signUp("key-create");
  const created = await (await testFetch(authed("POST", "/api-keys", user, { name: "ci" }))).json();

  expect(created.secret).toBeTruthy();
  expect(created.key.prefix.startsWith("lun_")).toBe(true);
  expect(created.secret.length).toBeGreaterThan(20);

  const list = await (await testFetch(authed("GET", "/api-keys", user))).json();
  expect(list.keys.length).toBe(1);
  const serialized = JSON.stringify(list);
  expect(serialized).not.toContain(created.secret);
  expect(serialized).not.toContain("key_hash");
});

test("bearer with valid key → read routes allowed (REQ-025 read-only)", async () => {
  const user = await signUp("key-read");
  const { monitor } = await createMonitor(user);
  const created = await (await testFetch(authed("POST", "/api-keys", user, { name: "ro" }))).json();
  const bearer = { authorization: `Bearer ${created.secret}` };

  const list = await testFetch(new Request("http://localhost/api/monitors", { headers: bearer }));
  expect(list.status).toBe(200);
  const body = await list.json();
  expect(body.monitors.some((m: { id: string }) => m.id === monitor!.id)).toBe(true);

  const metrics = await testFetch(new Request(`http://localhost/api/monitors/${monitor!.id}/metrics?range=1h&bucket=5m`, { headers: bearer }));
  expect(metrics.status).toBe(200);

  const incidents = await testFetch(new Request("http://localhost/api/incidents", { headers: bearer }));
  expect(incidents.status).toBe(200);
});

test("bearer cannot write — write routes require session (05 §4.1)", async () => {
  const user = await signUp("key-write");
  const created = await (await testFetch(authed("POST", "/api-keys", user, { name: "w" }))).json();
  const bearer = { authorization: `Bearer ${created.secret}`, "content-type": "application/json" };

  const create = await testFetch(new Request("http://localhost/api/monitors", {
    method: "POST", headers: bearer, body: JSON.stringify({ name: "x", url: "https://example.com" }),
  }));
  expect(create.status).toBe(401);

  const keyCreate = await testFetch(new Request("http://localhost/api-keys", {
    method: "POST", headers: bearer, body: JSON.stringify({ name: "evil" }),
  }));
  expect(keyCreate.status).toBe(401);
});

test("revoked key → 401 on next request", async () => {
  const user = await signUp("key-revoke");
  const created = await (await testFetch(authed("POST", "/api-keys", user, { name: "temp" }))).json();
  const bearer = { authorization: `Bearer ${created.secret}` };

  expect((await testFetch(new Request("http://localhost/api/monitors", { headers: bearer }))).status).toBe(200);

  const del = await testFetch(authed("DELETE", `/api-keys/${created.key.id}`, user));
  expect(del.status).toBe(204);

  expect((await testFetch(new Request("http://localhost/api/monitors", { headers: bearer }))).status).toBe(401);
});

test("cross-user revoke → 404; unauthenticated key list → 401", async () => {
  const owner = await signUp("key-owner");
  const stranger = await signUp("key-stranger");
  const created = await (await testFetch(authed("POST", "/api-keys", owner, { name: "own" }))).json();

  const foreign = await testFetch(authed("DELETE", `/api-keys/${created.key.id}`, stranger));
  expect(foreign.status).toBe(404);

  expect((await testFetch(new Request("http://localhost/api-keys"))).status).toBe(401);
});

test("invalid bearer secret → 401 (no user enumeration)", async () => {
  const res = await testFetch(new Request("http://localhost/api/monitors", {
    headers: { authorization: "Bearer lun_totally-made-up-secret" },
  }));
  expect(res.status).toBe(401);
  expect((await res.json()).code).toBe("UNAUTHENTICATED");
});
