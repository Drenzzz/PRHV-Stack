import { expect, test } from "bun:test";
import { testFetch } from "../+server";
import { authed, signUp } from "./test-helpers";
import { decodeEvent, encodeEvent } from "../lib/events";

// TEST-007 (SSE part): auth gate + event fan-out (REQ-024).

test("SSE stream without session → 401 taxonomy", async () => {
  const res = await testFetch(new Request("http://localhost/api/events"));
  expect(res.status).toBe(401);
  expect((await res.json()).code).toBe("UNAUTHENTICATED");
});

test("SSE stream with session → event-stream, published check arrives (REQ-024)", async () => {
  const user = await signUp("sse");
  const res = await testFetch(authed("GET", "/api/events", user));
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/event-stream");

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();

  // Wait for the readiness signal — the server emits ": connected" only after
  // its Redis subscription is live, so publishing after it cannot be missed.
  let received = "";
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline && !received.includes(": connected")) {
    const { value, done } = await reader.read();
    if (done) break;
    received += decoder.decode(value, { stream: true });
  }
  expect(received).toContain(": connected");

  // The worker publishes via redisPublisher(); here we publish directly on the
  // same channel to prove the server relays Redis messages to the stream.
  const { redisPublisher } = await import("../lib/redis");
  const raw = encodeEvent({
    type: "check",
    monitorId: "sse-test-monitor",
    ok: true,
    statusCode: 200,
    latencyMs: 12,
    at: new Date().toISOString(),
  });
  const delivered = await redisPublisher().publish("lunite:events", raw);
  expect(delivered).toBeGreaterThanOrEqual(1);

  while (Date.now() < deadline && !received.includes("sse-test-monitor")) {
    const { value, done } = await reader.read();
    if (done) break;
    received += decoder.decode(value, { stream: true });
  }
  await reader.cancel();

  expect(received).toContain("event: check");
  const dataLine = received.split("\n").find((l) => l.startsWith("data: "));
  expect(dataLine).toBeTruthy();
  const event = decodeEvent(dataLine!.slice("data: ".length));
  expect(event?.type).toBe("check");
  if (event?.type === "check") {
    expect(event.monitorId).toBe("sse-test-monitor");
    expect(event.ok).toBe(true);
  }
}, 15000);

test("event codec round-trips and rejects junk", () => {
  const raw = encodeEvent({ type: "incident", action: "opened", incidentId: "i1", monitorId: "m1", at: "now" });
  const decoded = decodeEvent(raw);
  expect(decoded?.type).toBe("incident");
  expect(decodeEvent("not json")).toBeNull();
  expect(decodeEvent(JSON.stringify({ type: "unknown" }))).toBeNull();
});
