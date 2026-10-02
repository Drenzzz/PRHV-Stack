import { encodeEvent, EVENTS_CHANNEL, type CheckEvent } from "../lib/events";
import { redisPublisher } from "../lib/redis";

// Publish a completed probe to the live-events channel (REQ-024).
// Fire-and-forget: event delivery is best-effort, the check row is the truth.
export async function publishCheckEvent(event: Omit<CheckEvent, "type">): Promise<void> {
  try {
    await redisPublisher().publish(EVENTS_CHANNEL, encodeEvent({ type: "check", ...event }));
  } catch (e) {
    console.error("[events] publish failed:", e instanceof Error ? e.message : e);
  }
}
