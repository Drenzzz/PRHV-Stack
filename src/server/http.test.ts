import { expect, test } from "bun:test";
import { apiError, notFound, unauthorized } from "./http";

test("unauthorized() returns taxonomy shape with 401", async () => {
  const res = unauthorized();
  expect(res.status).toBe(401);
  const body = await res.json();
  expect(body.code).toBe("UNAUTHENTICATED");
  expect(typeof body.message).toBe("string");
  expect(body.fields).toBeUndefined();
});

test("notFound() never leaks existence detail", async () => {
  const res = notFound();
  expect(res.status).toBe(404);
  const body = await res.json();
  expect(body.code).toBe("NOT_FOUND");
  expect(body.message).not.toContain("user");
});

test("apiError() builds arbitrary taxonomy responses", async () => {
  const res = apiError("CONFLICT", 409, "duplicate");
  expect(res.status).toBe(409);
  expect((await res.json()).code).toBe("CONFLICT");
});
