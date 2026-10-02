import { useCallback, useEffect, useRef, useState } from "react";
import { decodeEvent, type LuniteEvent } from "../lib/events";

export type LiveStatus = "connecting" | "live" | "reconnecting";

export interface LiveHandle {
  status: LiveStatus;
  // Latest event, re-triggered on every message; consumers compare monitorId.
  event: LuniteEvent | null;
  // Bumped when the stream (re)opens — a good moment to refetch stale rows.
  generation: number;
}

// SSE consumer for the dashboard (REQ-024, 06 §4): reconnect with backoff and
// refetch on reopen so stale rows self-heal. One connection per page.
export function useLiveEvents(monitorIds?: string[]): LiveHandle {
  const [status, setStatus] = useState<LiveStatus>("connecting");
  const [event, setEvent] = useState<LuniteEvent | null>(null);
  const [generation, setGeneration] = useState(0);
  const attemptRef = useRef(0);
  const filterRef = useRef(monitorIds);

  useEffect(() => {
    filterRef.current = monitorIds;
  }, [monitorIds]);

  useEffect(() => {
    let closed = false;
    let source: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const query = filterRef.current?.length ? `?monitorIds=${filterRef.current.join(",")}` : "";

    function connect() {
      if (closed) return;
      source = new EventSource(`/api/events${query}`);

      source.addEventListener("open", () => {
        if (closed) return;
        attemptRef.current = 0;
        setStatus("live");
        // Refetch on reopen: anything missed while disconnected is gone.
        setGeneration((g) => g + 1);
      });

      source.addEventListener("error", () => {
        if (closed) return;
        source?.close();
        setStatus("reconnecting");
        const backoff = Math.min(1000 * 2 ** attemptRef.current, 15000);
        attemptRef.current += 1;
        timer = setTimeout(connect, backoff);
      });

      for (const type of ["check", "incident"]) {
        source.addEventListener(type, (ev) => {
          const data = decodeEvent((ev as MessageEvent).data);
          if (data && !closed) setEvent(data);
        });
      }
    }

    connect();

    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      source?.close();
    };
  }, []);

  return { status, event, generation };
}

// Apply a live check event onto a monitor row without refetching everything.
export function applyCheckEvent<T extends { id: string; lastLatencyMs: number | null; currentStatus: string }>(
  rows: T[],
  monitorId: string,
  ok: boolean,
  latencyMs: number | null,
): T[] {
  return rows.map((row) =>
    row.id === monitorId
      ? { ...row, lastLatencyMs: latencyMs, currentStatus: ok ? "up" : "down" }
      : row,
  );
}

export function useListRefresh(refetch: () => void) {
  const cb = useRef(refetch);
  useEffect(() => {
    cb.current = refetch;
  }, [refetch]);
  return useCallback(() => cb.current(), []);
}
