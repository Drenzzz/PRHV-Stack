import { afterAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { dbPostgres } from "../database/drizzle/db";
import { testFetch } from "../+server";
import { authed, signUp } from "./test-helpers";
import { encryptToken, decryptToken, hashApiKey, apiKeyPrefix } from "../lib/crypto";

// REQ-031 (channels) + REQ-033 (secret handling).

const db = dbPostgres();

afterAll(async () => {
  await db.execute(sql`DELETE FROM alert_channels WHERE user_id IN (SELECT id FROM "user" WHERE email LIKE 'chan-%@test.lunite.dev')`);
  await db.execute(sql`DELETE FROM "user" WHERE email LIKE 'chan-%@test.lunite.dev'`);
});

test("crypto: encrypt/decrypt round-trip; ciphertext differs from plaintext", () => {
  const secret = "123456:ABC-DEF_token_value";
  const enc = encryptToken(secret);
  expect(enc).not.toContain(secret);
  expect(decryptToken(enc)).toBe(secret);
  // Two encryptions of the same value differ (random IV).
  expect(encryptToken(secret)).not.toBe(enc);
});

test("api key helpers: hash is stable, prefix is short", () => {
  const secret = "abcd1234efgh5678";
  expect(hashApiKey(secret)).toBe(hashApiKey(secret));
  expect(apiKeyPrefix(secret)).toBe("lun_abcd1234");
});

test("create channel → 201, token masked, DB holds ciphertext only", async () => {
  const user = await signUp("chan-create");
  const res = await testFetch(authed("POST", "/api/channels", user, {
    chatId: "12345",
    token: "123456:TESTTOKEN-abcdefghijklmnop",
  }));
  expect(res.status).toBe(201);
  const body = await res.json();
  expect(body.channel.chatId).toBe("12345");
  expect(body.channel.token).toBe("••••••••");
  expect(body.channel.hasOwnToken).toBe(true);

  const dbRows = (await db.execute(sql`
    SELECT token_encrypted FROM alert_channels WHERE id = ${body.channel.id}
  `)) as unknown as Array<{ token_encrypted: string }>;
  expect(dbRows[0].token_encrypted).not.toContain("TESTTOKEN");
  expect(dbRows[0].token_encrypted).toContain(":");

  await db.execute(sql`DELETE FROM alert_channels WHERE id = ${body.channel.id}`);
});

test("list channels → tokens always masked", async () => {
  const user = await signUp("chan-list");
  await testFetch(authed("POST", "/api/channels", user, { chatId: "42" }));
  const res = await testFetch(authed("GET", "/api/channels", user));
  expect(res.status).toBe(200);
  const body = await res.json();
  const raw = JSON.stringify(body);
  expect(raw).not.toContain("token_encrypted");
  for (const ch of body.channels) {
    expect(ch.token).toBe("••••••••");
    expect(ch.hasOwnToken).toBe(false); // no own token → fallback to platform bot
  }
});

test("test send with unreachable token → delivered:false, no crash", async () => {
  const user = await signUp("chan-test");
  const create = await (await testFetch(authed("POST", "/api/channels", user, {
    chatId: "1",
    token: "000:invalid-token-for-test",
  }))).json();

  const res = await testFetch(authed("POST", `/api/channels/${create.channel.id}/test`, user));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.delivered).toBe(false);
  await db.execute(sql`DELETE FROM alert_channels WHERE id = ${create.channel.id}`);
});

test("test send on another user's channel → 404 (REQ-032)", async () => {
  const owner = await signUp("chan-owner");
  const create = await (await testFetch(authed("POST", "/api/channels", owner, { chatId: "7" }))).json();
  const stranger = await signUp("chan-stranger");
  const res = await testFetch(authed("POST", `/api/channels/${create.channel.id}/test`, stranger));
  expect(res.status).toBe(404);
  await db.execute(sql`DELETE FROM alert_channels WHERE id = ${create.channel.id}`);
});

test("unauthenticated channels access → 401", async () => {
  expect((await testFetch(new Request("http://localhost/api/channels"))).status).toBe(401);
  expect((await testFetch(new Request("http://localhost/api/channels/x/test", { method: "POST" }))).status).toBe(401);
});
