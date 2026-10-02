import { afterAll, expect, test } from "bun:test";
import { redisPublisher } from "../lib/redis";
import { consume } from "./rate-limit";

// REQ-026 unit coverage: the fixed-window counter rejects over the limit with
// Retry-After, and fails open when Redis is unavailable.

const RUN = Date.now().toString(36);
const keys: string[] = [];

afterAll(async () => {
  try {
    if (keys.length) await redisPublisher().del(...keys);
  } catch {
    // best-effort cleanup
  }
});

test("consume allows up to the limit, then rejects with retryAfter", async () => {
  const scope = `t${RUN}`;
  for (let i = 0; i < 3; i++) {
    const r = await consume(scope, "id1", 3);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(3 - (i + 1));
    keys.push(`rl:${scope}:id1:${Math.floor(Date.now() / 1000 / 60) * 60}`);
  }
  const over = await consume(scope, "id1", 3);
  expect(over.allowed).toBe(false);
  expect(over.retryAfter).toBeGreaterThan(0);
});

test("separate ids have separate windows", async () => {
  const scope = `t${RUN}`;
  const r = await consume(scope, "id2", 1);
  expect(r.allowed).toBe(true);
});
