// HTTP prober (REQ-009): one probe = one HTTP(S) request with timeout, TTFB,
// total latency, and status capture. Never throws — errors become `ok=false` rows.

export interface ProbeResult {
  ok: boolean;
  statusCode: number | null;
  ttfbMs: number | null;
  latencyMs: number | null;
  error: string | null;
}

export async function probe(url: string, timeoutMs: number): Promise<ProbeResult> {
  const started = performance.now();
  let ttfb: number | null = null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      redirect: "follow",
      headers: { "user-agent": "Lunite/1.0 (+uptime monitor)" },
    });
    // Drain a bounded slice of the body to detect truncation without buffering everything.
    await res.arrayBuffer();
    ttfb ??= Math.round(performance.now() - started);
    return {
      ok: true,
      statusCode: res.status,
      ttfbMs: ttfb,
      latencyMs: Math.round(performance.now() - started),
      error: null,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const timedOut = message.includes("abort") || message.includes("Timeout");
    return {
      ok: false,
      statusCode: null,
      ttfbMs: ttfb,
      latencyMs: Math.round(performance.now() - started),
      error: timedOut ? `timed out after ${timeoutMs}ms` : message,
    };
  } finally {
    clearTimeout(timer);
  }
}
