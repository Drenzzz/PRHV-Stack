import { expect, test } from "bun:test";
import { daysUntil, shouldAlertSsl, SSL_ALERT_DAYS } from "./ssl";

// TEST-M4-SSL (REQ-028): threshold math — alert once when expiry crosses the
// 14-day window; never for distant expiry.

const now = new Date("2026-10-03T00:00:00Z");

test("daysUntil floors fractional days", () => {
  expect(daysUntil(new Date("2026-10-10T00:00:00Z"), now)).toBe(7);
  expect(daysUntil(new Date("2026-10-03T12:00:00Z"), now)).toBe(0);
  expect(daysUntil(new Date("2026-10-01T00:00:00Z"), now)).toBe(-2);
});

test("alert fires at and under the 14-day threshold", () => {
  expect(SSL_ALERT_DAYS).toBe(14); // OQ-004 resolved default
  expect(shouldAlertSsl(new Date("2026-10-04T00:00:00Z"), now)).toBe(true); // 1 day
  expect(shouldAlertSsl(new Date("2026-10-17T00:00:00Z"), now)).toBe(true); // 14 days
  expect(shouldAlertSsl(new Date("2026-10-18T00:00:00Z"), now)).toBe(false); // 15 days
  expect(shouldAlertSsl(new Date("2026-12-25T00:00:00Z"), now)).toBe(false);
});

test("expired certificate alerts", () => {
  expect(shouldAlertSsl(new Date("2026-10-01T00:00:00Z"), now)).toBe(true);
});
