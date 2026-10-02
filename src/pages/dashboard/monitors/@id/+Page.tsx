import { useCallback, useEffect, useState } from "react";
import { usePageContext } from "vike-react/usePageContext";
import { navigate } from "vike/client/router";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge, type MonitorStatus } from "@/components/status-badge";
import { LatencyChart } from "../../../../components/latency-chart";
import { UptimeBar } from "../../../../components/uptime-bar";
import { IncidentLog } from "../../../../components/incident-log";
import { api, type BucketRow, type DayCell, type IncidentRow, type Monitor, type MonitorListRow } from "../../../../lib/api";
import { showApiError, redirectToLogin, isSessionExpired } from "../../../../lib/errors";
import { useLiveEvents } from "../../../../hooks/use-live-events";
import { formatMs, formatUptime } from "../../../../lib/format";
import { toast } from "sonner";
import { IconChevronLeft, IconRefresh } from "@tabler/icons-react";

type Range = "1h" | "24h" | "7d" | "30d" | "90d";
const RANGES: Range[] = ["1h", "24h", "7d", "30d", "90d"];
const BUCKET_BY_RANGE: Record<Range, string> = {
  "1h": "5m",
  "24h": "5m",
  "7d": "1h",
  "30d": "1h",
  "90d": "1h",
};

// Monitor detail (REQ-030): latency chart, 90-day strip (REQ-023), incident
// log, and a manual check-now action. Live updates flow through the same SSE
// stream the list uses.
export default function Page() {
  const pageContext = usePageContext();
  const monitorId = pageContext.routeParams?.id;
  const { status: liveStatus, event, generation } = useLiveEvents(monitorId ? [monitorId] : undefined);

  const [monitor, setMonitor] = useState<Monitor | null>(null);
  const [summary, setSummary] = useState<MonitorListRow | null>(null);
  const [range, setRange] = useState<Range>("24h");
  const [series, setSeries] = useState<BucketRow[]>([]);
  const [uptime, setUptime] = useState<{ days: number; series: DayCell[] } | null>(null);
  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [checking, setChecking] = useState(false);

  const load = useCallback(async () => {
    if (!monitorId) return;
    try {
      // listMonitors carries the derived fields (status/lastLatency/uptime30d)
      // that getMonitor does not — one extra request keeps the header honest.
      const [m, metrics, daily, incs, list] = await Promise.all([
        api.getMonitor(monitorId),
        api.metrics(monitorId, range, BUCKET_BY_RANGE[range]),
        api.uptimeDaily(monitorId, 90),
        api.monitorIncidents(monitorId),
        api.listMonitors(),
      ]);
      setMonitor(m.monitor);
      setSummary(list.monitors.find((row) => row.id === monitorId) ?? null);
      setSeries(metrics.series);
      setUptime(daily);
      setIncidents(incs.incidents);
      setState("ready");
    } catch (err) {
      if (isSessionExpired(err)) return redirectToLogin();
      showApiError(err);
      setState("error");
    }
  }, [monitorId, range]);

  useEffect(() => {
    void load();
  }, [load]);

  // Apply live check events to the header values. Functional update keyed only
  // on `event` — including `monitor` in deps would re-trigger on every state
  // change and loop (setMonitor inside effect with object dep = infinite render).
  useEffect(() => {
    if (!event || event.type !== "check") return;
    setMonitor((prev) => {
      if (!prev) return prev;
      const nextStatus = event.ok ? "up" : "down";
      if (prev.currentStatus === nextStatus) return prev;
      return { ...prev, currentStatus: nextStatus } as Monitor;
    });
  }, [event]);

  useEffect(() => {
    if (generation > 0) void load();
  }, [generation, load]);

  async function handleCheckNow() {
    if (!monitorId || checking) return;
    setChecking(true);
    try {
      await api.checkNow(monitorId);
      toast.success("Check queued", { description: "The next tick will run it." });
      // Give the worker a moment, then refetch so the new row shows up.
      setTimeout(() => void load(), 2500);
    } catch (err) {
      if (isSessionExpired(err)) return redirectToLogin();
      showApiError(err);
    } finally {
      setChecking(false);
    }
  }

  if (state === "loading") {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (state === "error" || !monitor) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
        <p className="text-sm text-muted-foreground">Couldn&apos;t load this monitor.</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => navigate("/dashboard")}>
            <IconChevronLeft className="size-4" />
            Back to monitors
          </Button>
          <Button size="sm" onClick={() => void load()}>Retry</Button>
        </div>
      </div>
    );
  }

  const status = (monitor.currentStatus ?? "unknown") as MonitorStatus;
  const sslDaysLeft = monitor.sslExpiresAt
    ? Math.floor((new Date(monitor.sslExpiresAt).getTime() - Date.now()) / 86400000)
    : null;

  return (
    <div className="flex flex-1 flex-col gap-5 py-4 lg:px-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <IconChevronLeft className="size-3.5" />
            Monitors
          </button>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-medium">{monitor.name}</h2>
            <StatusBadge status={status} />
            {!monitor.active && <Badge variant="secondary">Paused</Badge>}
          </div>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{monitor.url}</p>
          {monitor.sslExpiresAt && sslDaysLeft !== null && (
            <p className="font-mono text-xs text-muted-foreground">
              SSL expires{" "}
              <span
                style={{ color: sslDaysLeft <= 14 ? "var(--status-degraded)" : undefined }}
              >
                {new Date(monitor.sslExpiresAt).toISOString().slice(0, 10)}
              </span>
              {" "}({sslDaysLeft}d)
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{liveStatus === "live" ? "Live" : liveStatus}</span>
          <Button size="sm" onClick={() => void handleCheckNow()} disabled={checking || !monitor.active}>
            <IconRefresh className="size-4" />
            {checking ? "Queueing…" : "Check now"}
          </Button>
        </div>
      </div>

      {/* Latency chart + range switcher */}
      <Card>
        <CardHeader>
          <CardTitle>Latency</CardTitle>
          <div className="ml-auto flex gap-1">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={range === r}
                onClick={() => setRange(r)}
                className={
                  "rounded-md px-2 py-1 text-xs font-medium outline-none transition-colors " +
                  "focus-visible:ring-2 focus-visible:ring-ring " +
                  (range === r
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground")
                }
              >
                {r}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <LatencyChart series={series} />
        </CardContent>
      </Card>

      {/* 90-day strip */}
      <Card>
        <CardHeader>
          <CardTitle>Uptime — last 90 days</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <UptimeBar series={uptime?.series ?? []} />
          <p className="font-mono text-xs tabular-nums text-muted-foreground">
            Uptime 30d: {formatUptime(summary?.uptime30d ?? null)}
            {" · "}
            Last latency: {formatMs(event?.type === "check" ? event.latencyMs : (summary?.lastLatencyMs ?? null))}
          </p>
        </CardContent>
      </Card>

      {/* Incident log */}
      <Card>
        <CardHeader>
          <CardTitle>Incidents</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <IncidentLog incidents={incidents} />
        </CardContent>
      </Card>
    </div>
  );
}
