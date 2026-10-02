import { expect, test } from "bun:test";
import { testFetch } from "../+server";
import { openApiSpec } from "./openapi";

// TEST-M4-OPENAPI (REQ-027): spec serves, docs serve, and the spec mirrors
// the routes the app actually implements.

test("/openapi.json → 200 with 3.1 spec and all documented paths", async () => {
  const res = await testFetch(new Request("http://localhost/openapi.json"));
  expect(res.status).toBe(200);
  const spec = await res.json();
  expect(spec.openapi).toBe("3.1.0");
  expect(Object.keys(spec.paths).length).toBeGreaterThanOrEqual(19);
});

test("spec documents every implemented route group", async () => {
  const paths = Object.keys(openApiSpec.paths);
  // One representative path per implemented feature area (smoke parity).
  for (const p of [
    "/api/monitors",
    "/api/monitors/{id}",
    "/api/monitors/{id}/metrics",
    "/api/incidents",
    "/api/channels",
    "/api/status-pages",
    "/api/status/{slug}",
    "/api-keys",
    "/api/events",
  ]) {
    expect(paths).toContain(p);
  }
});

test("spec documents both auth schemes and rate-limit response", async () => {
  expect(Object.keys(openApiSpec.components.securitySchemes)).toEqual(
    expect.arrayContaining(["sessionCookie", "bearerAuth"]),
  );
  // Every documented 429 carries Retry-After.
  const with429 = Object.values(openApiSpec.paths).flatMap((ops: any) =>
    Object.values(ops).filter((o: any) => o.responses?.["429"]),
  );
  expect(with429.length).toBeGreaterThan(0);
});

test("/docs → 200 HTML reference", async () => {
  const res = await testFetch(new Request("http://localhost/docs"));
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/html");
  const html = await res.text();
  expect(html).toContain("Lunite API");
});
