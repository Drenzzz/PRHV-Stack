import { afterAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { dbPostgres } from "../database/drizzle/db";
import { testFetch } from "../+server";
import { authed, createMonitor, signUp } from "./test-helpers";

// TEST-M4-STATUS: status page CRUD + public read scoping (REQ-022, REQ-023).

const db = dbPostgres();

afterAll(async () => {
  await db.execute(sql`DELETE FROM status_page_monitors WHERE status_page_id IN (SELECT id FROM status_pages WHERE user_id IN (SELECT id FROM "user" WHERE email LIKE 'sp-%@test.lunite.dev'))`);
  await db.execute(sql`DELETE FROM status_pages WHERE user_id IN (SELECT id FROM "user" WHERE email LIKE 'sp-%@test.lunite.dev')`);
  await db.execute(sql`DELETE FROM monitors WHERE user_id IN (SELECT id FROM "user" WHERE email LIKE 'sp-%@test.lunite.dev')`);
  await db.execute(sql`DELETE FROM "user" WHERE email LIKE 'sp-%@test.lunite.dev'`);
});

test("create status page → 201, list shows it, public read requires no session", async () => {
  const user = await signUp("sp-create");
  const { monitor } = await createMonitor(user);

  const create = await testFetch(authed("POST", "/api/status-pages", user, {
    slug: "sp-create-test",
    title: "Acme Services",
    description: "Everything running",
    monitorIds: [monitor!.id],
  }));
  expect(create.status).toBe(201);

  const list = await testFetch(authed("GET", "/api/status-pages", user));
  const listBody = await list.json();
  expect(listBody.pages.some((p: { slug: string }) => p.slug === "sp-create-test")).toBe(true);

  // Public read — no cookie at all.
  const pub = await testFetch(new Request("http://localhost/api/status/sp-create-test"));
  expect(pub.status).toBe(200);
  const payload = await pub.json();
  expect(payload.title).toBe("Acme Services");
  expect(payload.overall).toBe("up"); // example.com monitor is up
  expect(payload.monitors.length).toBe(1);
  expect(payload.monitors[0].bars.length).toBe(90); // 90-day strip
});

test("unknown slug → 404, invalid slug → 404 (no existence oracle)", async () => {
  expect((await testFetch(new Request("http://localhost/api/status/no-such-page"))).status).toBe(404);
  expect((await testFetch(new Request("http://localhost/api/status/UPPER"))).status).toBe(404);
});

test("duplicate slug → 409 CONFLICT", async () => {
  const user = await signUp("sp-dup");
  const first = await testFetch(authed("POST", "/api/status-pages", user, { slug: "sp-dup-page", title: "A" }));
  expect(first.status).toBe(201);
  const second = await testFetch(authed("POST", "/api/status-pages", user, { slug: "sp-dup-page", title: "B" }));
  expect(second.status).toBe(409);
});

test("monitor not owned by creator is excluded from publish list (REQ-032)", async () => {
  const owner = await signUp("sp-owner");
  const stranger = await signUp("sp-stranger");
  const { monitor: foreign } = await createMonitor(stranger);

  // Attacker tries to publish someone else's monitor on their own status page.
  const create = await testFetch(authed("POST", "/api/status-pages", owner, {
    slug: "sp-foreign-monitor",
    title: "Leaky",
    monitorIds: [foreign!.id],
  }));
  expect(create.status).toBe(201);

  const pub = await (await testFetch(new Request("http://localhost/api/status/sp-foreign-monitor"))).json();
  expect(pub.monitors.length).toBe(0); // foreign monitor excluded
  expect(JSON.stringify(pub)).not.toContain(foreign!.id);
});

test("cross-user management → 404", async () => {
  const owner = await signUp("sp-mng-owner");
  const stranger = await signUp("sp-mng-stranger");
  const created = await (await testFetch(authed("POST", "/api/status-pages", owner, { slug: "sp-managed", title: "Owned" }))).json();

  const patch = await testFetch(authed("PATCH", `/api/status-pages/${created.page.id}`, stranger, { title: "Hacked" }));
  expect(patch.status).toBe(404);
  const del = await testFetch(authed("DELETE", `/api/status-pages/${created.page.id}`, stranger));
  expect(del.status).toBe(404);
});

test("unauthenticated management → 401", async () => {
  expect((await testFetch(new Request("http://localhost/api/status-pages"))).status).toBe(401);
  expect((await testFetch(new Request("http://localhost/api/status-pages", { method: "POST" }))).status).toBe(401);
});

test("patch updates title and monitor selection; delete → 204 then public 404", async () => {
  const user = await signUp("sp-patch");
  const { monitor } = await createMonitor(user);
  const created = await (await testFetch(authed("POST", "/api/status-pages", user, {
    slug: "sp-patch-page", title: "Before", monitorIds: [],
  }))).json();

  const patched = await testFetch(authed("PATCH", `/api/status-pages/${created.page.id}`, user, {
    title: "After",
    monitorIds: [monitor!.id],
  }));
  expect(patched.status).toBe(200);
  const body = await patched.json();
  expect(body.page.title).toBe("After");

  const pub = await (await testFetch(new Request("http://localhost/api/status/sp-patch-page"))).json();
  expect(pub.title).toBe("After");
  expect(pub.monitors.length).toBe(1);

  const del = await testFetch(authed("DELETE", `/api/status-pages/${created.page.id}`, user));
  expect(del.status).toBe(204);
  expect((await testFetch(new Request("http://localhost/api/status/sp-patch-page"))).status).toBe(404);
});
