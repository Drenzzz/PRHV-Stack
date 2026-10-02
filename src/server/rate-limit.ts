import type { UniversalMiddleware } from "@universal-middleware/core";
import { redisPublisher } from "../lib/redis";

// Redis fixed-window rate limiting (REQ-026, ADR-008). Fail-open when Redis is
// unavailable — availability beats strict limiting at portfolio scale, and the
// failure is logged (documented failure behavior, 04 §6).

const WINDOW_SEC = 60;

export interface LimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter: number;
}

// INCR is the window counter; EXPIRE only on first hit for the window.
export async function consume(scope: string, id: string, limit: number): Promise<LimitResult> {
  const windowStart = Math.floor(Date.now() / 1000 / WINDOW_SEC) * WINDOW_SEC;
  const key = `rl:${scope}:${id}:${windowStart}`;
  try {
    const redis = redisPublisher();
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, WINDOW_SEC + 1);
    if (count > limit) {
      const ttl = await redis.ttl(key);
      return { allowed: false, remaining: 0, retryAfter: ttl > 0 ? ttl : WINDOW_SEC };
    }
    return { allowed: true, remaining: limit - count, retryAfter: 0 };
  } catch {
    // Redis down → fail open with a log (ADR-008).
    console.error(`[rate-limit] Redis unavailable; failing open for ${scope}:${id}`);
    return { allowed: true, remaining: limit, retryAfter: 0 };
  }
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

function tooMany(retryAfter: number): Response {
  return new Response(
    JSON.stringify({ code: "RATE_LIMITED", message: "Too many requests" }),
    { status: 429, headers: { "content-type": "application/json", "retry-after": String(retryAfter) } },
  );
}

// Single place for every rate limit (REQ-026):
//  - /api/auth/*      → per-IP 10/min
//  - session requests → per-session-token 100/min
//  - bearer API keys  → per-key 60/min (counted on the raw secret so rotation
//                       resets naturally; the window is short anyway)
export const rateLimitMiddleware: UniversalMiddleware = async (request) => {
  // Test suites create dozens of accounts per minute from one IP — without
  // this flag they'd hit their own 10/min auth limit. Production stays ON;
  // bunfig.toml sets this for `bun test` only.
  if (process.env.RATE_LIMIT_DISABLED === "true") return;

  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return; // pages & SSE untouched

  if (url.pathname.startsWith("/api/auth/")) {
    const ip = await consume("ip-auth", clientIp(request), 10);
    if (!ip.allowed) return tooMany(ip.retryAfter);
    return;
  }

  const bearer = request.headers.get("authorization");
  if (bearer?.startsWith("Bearer ")) {
    const secret = bearer.slice(7).trim();
    if (secret) {
      const key = await consume("apikey", secret, 60);
      if (!key.allowed) return tooMany(key.retryAfter);
    }
    return;
  }

  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(/better-auth\.session_token=([^;]+)/);
  if (match) {
    const user = await consume("user", decodeURIComponent(match[1]), 100);
    if (!user.allowed) return tooMany(user.retryAfter);
  }
};
