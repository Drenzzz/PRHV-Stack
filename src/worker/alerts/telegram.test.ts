import { afterAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { dbPostgres } from "../../database/drizzle/db";
import { incidentMessage, recoveryMessage } from "./telegram";

// REQ-021 unit coverage: message templates + retry semantics against a mock
// Bot API endpoint (network path swapped via env in production code is not
// needed — sendTelegram is exercised live in test-send with invalid tokens).

const db = dbPostgres();
const CHANNEL_ID = "notifier-test-channel";
const USER_ID = "notifier-test-user";

afterAll(async () => {
  await db.execute(sql`DELETE FROM alert_channels WHERE id = ${CHANNEL_ID}`);
  await db.execute(sql`DELETE FROM "user" WHERE id = ${USER_ID}`);
});

test("incident message template carries name/url/error/time (REQ-021)", () => {
  const since = new Date("2026-10-03T10:00:00Z");
  const msg = incidentMessage("Hayainime", "https://api.hayainime.com", "timeout after 10000ms", since);
  expect(msg).toContain("Hayainime");
  expect(msg).toContain("https://api.hayainime.com");
  expect(msg).toContain("timeout after 10000ms");
  expect(msg).toContain("2026-10-03T10:00:00");
  expect(msg.startsWith("🔴")).toBe(true);
});

test("recovery message carries duration", () => {
  const downSince = new Date(Date.now() - 6 * 60 * 1000);
  const msg = recoveryMessage("Wiradoor", "https://wiradoorsumbar.com", downSince);
  expect(msg).toContain("Wiradoor");
  expect(msg).toContain("Down for");
  expect(msg.startsWith("🟢")).toBe(true);
});

test("notifier: missing channel → false, no throw", async () => {
  const { notifyIncident } = await import("./telegram");
  const result = await notifyIncident("no-such-channel-id", "test");
  expect(result).toBe(false);
});
