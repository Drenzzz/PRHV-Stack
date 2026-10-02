// Shared event types for the Redis pub/sub channel and SSE fan-out (REQ-024).
// One event shape shared by worker (publish) and server (consume) — 04 §4.

export interface CheckEvent {
  type: "check";
  monitorId: string;
  ok: boolean;
  statusCode: number | null;
  latencyMs: number | null;
  at: string;
}

export interface IncidentEvent {
  type: "incident";
  action: "opened" | "resolved";
  incidentId: string;
  monitorId: string;
  at: string;
}

export type LuniteEvent = CheckEvent | IncidentEvent;

export const EVENTS_CHANNEL = "lunite:events";

export function encodeEvent(event: LuniteEvent): string {
  return JSON.stringify(event);
}

export function decodeEvent(raw: string): LuniteEvent | null {
  try {
    const parsed = JSON.parse(raw) as LuniteEvent;
    if (parsed.type === "check" || parsed.type === "incident") return parsed;
    return null;
  } catch {
    return null;
  }
}
