import { enhance, type UniversalHandler } from "@universal-middleware/core";
import { decodeEvent, EVENTS_CHANNEL } from "../lib/events";
import { redisSubscriber } from "../lib/redis";
import { unauthorized } from "./http";
import { requireUserId } from "./session";

// SSE live events (REQ-024, ADR-010): Redis pub/sub → server → SSE clients.
// Must be registered ahead of the Vike fallthrough in hono.ts (02 §8).

export const liveEventsHandler: UniversalHandler = enhance(
  async (request, _context, runtime) => {
    const userId = await requireUserId(request, runtime);
    if (!userId) return unauthorized();

    const monitorFilter = new URL(request.url).searchParams.get("monitorIds")?.split(",").filter(Boolean) ?? null;
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let closed = false;
        const send = (line: string) => {
          if (!closed) controller.enqueue(encoder.encode(line));
        };

        send(": connected\n\n");
        // Heartbeat keeps proxies from idling the connection out (04 §4).
        const heartbeat = setInterval(() => send(": heartbeat\n\n"), 15000);

        const subscriber = redisSubscriber();
        const onMessage = (channel: string, raw: string) => {
          if (channel !== EVENTS_CHANNEL) return;
          const event = decodeEvent(raw);
          if (!event) return;
          if (event.type === "check" && monitorFilter && !monitorFilter.includes(event.monitorId)) return;
          send(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
        };
        await subscriber.subscribe(EVENTS_CHANNEL);
        subscriber.on("message", onMessage);

        // @universal-middleware aborts the request signal when the client disconnects.
        request.signal?.addEventListener("abort", () => {
          closed = true;
          clearInterval(heartbeat);
          subscriber.off("message", onMessage);
          subscriber.unsubscribe(EVENTS_CHANNEL).catch(() => {});
          try {
            controller.close();
          } catch {
            // already closed
          }
        });
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      },
    });
  },
  { name: "lunite:live-events", path: "/api/events", method: "GET", immutable: false },
);
