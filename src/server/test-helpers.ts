import { testFetch } from "../+server";
import type { Monitor } from "../database/drizzle/queries/monitors";

// Integration helpers against the real Hono app (TEST-004).
// Each helper gets a unique user so tests never collide.

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}@test.lunite.dev`;
}

export interface TestUser {
  email: string;
  cookie: string;
}

export async function signUp(prefix: string): Promise<TestUser> {
  const email = uniqueEmail(prefix);
  const res = await testFetch(new Request("http://localhost/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "correct-horse-battery", name: prefix }),
  }));
  if (res.status !== 200) {
    throw new Error(`sign-up failed: ${res.status} ${await res.text()}`);
  }
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("sign-up returned no session cookie");
  return { email, cookie: setCookie.split(";")[0] };
}

export function authed(method: string, path: string, user: TestUser, body?: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      cookie: user.cookie,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function createMonitor(
  user: TestUser,
  overrides: Partial<Record<string, unknown>> = {},
): Promise<{ status: number; monitor?: Monitor; body?: unknown }> {
  const res = await testFetch(authed("POST", "/api/monitors", user, {
    name: "Test monitor",
    url: "https://example.com/health",
    ...overrides,
  }));
  const json = res.status === 201 ? await res.json() : await res.json().catch(() => undefined);
  return { status: res.status, monitor: json?.monitor, body: json };
}

export async function getMonitor(user: TestUser, id: string): Promise<Response> {
  return testFetch(authed("GET", `/api/monitors/${id}`, user));
}
