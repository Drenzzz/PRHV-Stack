import { expect, test } from "bun:test";
import { evaluateContract } from "./contract";

// TEST-003: contract evaluation matrix (REQ-010).

test("status mismatch → fail with expected-vs-actual", () => {
  const v = evaluateContract(true, 503, "anything", { expectedStatus: 200, expectedKeywords: [] });
  expect(v.ok).toBe(false);
  expect(v.error).toBe("expected status 200, got 503");
});

test("status match but keyword missing → fail with missing keyword", () => {
  const v = evaluateContract(true, 200, '{"status":"down"}', { expectedStatus: 200, expectedKeywords: ['"status":"ok"'] });
  expect(v.ok).toBe(false);
  expect(v.error).toContain('keyword not found in body: "\\"status\\":\\"ok\\""');
});

test("multiple keywords: one missing names only the missing one", () => {
  const v = evaluateContract(true, 200, "alpha beta", { expectedKeywords: ["alpha", "gamma"] });
  expect(v.ok).toBe(false);
  expect(v.error).toContain('"gamma"');
  expect(v.error).not.toContain('"alpha"');
});

test("all expectations met → ok=true", () => {
  const v = evaluateContract(true, 200, '{"status":"ok"}', { expectedStatus: 200, expectedKeywords: ['"status":"ok"'] });
  expect(v.ok).toBe(true);
  expect(v.error).toBeNull();
});

test("no expectations configured → any 2xx-layer success passes", () => {
  const v = evaluateContract(true, 302, null, { expectedStatus: null, expectedKeywords: [] });
  expect(v.ok).toBe(true);
});

test("keyword check with unreadable body → fail (not silent pass)", () => {
  const v = evaluateContract(true, 200, null, { expectedKeywords: ["ok"] });
  expect(v.ok).toBe(false);
  expect(v.error).toContain("body not readable");
});

test("keyword scan is case-sensitive (04 §4)", () => {
  const v = evaluateContract(true, 200, "OK", { expectedKeywords: ["ok"] });
  expect(v.ok).toBe(false);
});

test("network-level failure passes through (error comes from probe result)", () => {
  const v = evaluateContract(false, null, null, { expectedStatus: 200, expectedKeywords: ["x"] });
  expect(v.ok).toBe(false);
  expect(v.error).toBeNull();
});
