import { useCallback, useEffect, useState } from "react";
import { navigate } from "vike/client/router";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty";
import { MonitorRow } from "../../components/monitor-row";
import { api, type MonitorListRow } from "../../lib/api";
import { showApiError, redirectToLogin, isSessionExpired } from "../../lib/errors";
import { applyCheckEvent, useLiveEvents } from "../../hooks/use-live-events";
import { IconPlus, IconPlugConnected, IconPlugConnectedX } from "@tabler/icons-react";
import { cn } from "cn";

type LoadState = "loading" | "ready" | "error";

// Monitor list (REQ-029): live via SSE, refetch on stream reopen so missed
// events self-heal (06 §4 "SSE dropped").
export default function Page() {
  const [rows, setRows] = useState<MonitorListRow[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const { status, event, generation } = useLiveEvents();

  const load = useCallback(async () => {
    try {
      const res = await api.listMonitors();
      setRows(res.monitors);
      setState("ready");
    } catch (err) {
      if (isSessionExpired(err)) return redirectToLogin();
      showApiError(err);
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Apply live check events without refetching the whole list.
  useEffect(() => {
    if (!event || event.type !== "check") return;
    setRows((prev) => applyCheckEvent(prev, event.monitorId, event.ok, event.latencyMs));
  }, [event]);

  // Refetch whenever the stream (re)opens.
  useEffect(() => {
    if (generation > 0) void load();
  }, [generation, load]);

  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 lg:px-6">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-medium">Monitors</h2>
              <LiveIndicator status={status} />
            </div>
            <Button size="sm" onClick={() => navigate("/dashboard/monitors/new")}>
              <IconPlus className="size-4" />
              New monitor
            </Button>
          </div>

          <div className="border-t px-0 lg:px-6">
            {state === "loading" && <ListSkeleton />}

            {state === "error" && (
              <div className="px-4 py-8 text-sm text-muted-foreground">
                Couldn&apos;t load monitors.{" "}
                <button type="button" className="underline underline-offset-4" onClick={() => void load()}>
                  Retry
                </button>
              </div>
            )}

            {state === "ready" && rows.length === 0 && (
              <div className="px-4 py-10 lg:px-6">
                <Empty>
                  <EmptyHeader>
                    <EmptyTitle>Nothing on the radar yet</EmptyTitle>
                    <EmptyDescription>
                      Add your first endpoint to start watching.
                    </EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    <Button size="sm" onClick={() => navigate("/dashboard/monitors/new")}>
                      <IconPlus className="size-4" />
                      Add monitor
                    </Button>
                  </EmptyContent>
                </Empty>
              </div>
            )}

            {state === "ready" && rows.length > 0 && (
              <ul className="divide-y">
                {rows.map((m) => (
                  <MonitorRow key={m.id} monitor={m} onNavigate={(id) => navigate(`/dashboard/monitors/${id}`)} />
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function LiveIndicator({ status }: { status: "connecting" | "live" | "reconnecting" }) {
  const live = status === "live";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs text-muted-foreground",
        live && "text-[var(--live)]",
      )}
      aria-live="polite"
    >
      {live ? (
        <IconPlugConnected className="size-3.5 animate-pulse" aria-hidden />
      ) : (
        <IconPlugConnectedX className="size-3.5" aria-hidden />
      )}
      {live ? "Live" : status === "connecting" ? "Connecting…" : "Reconnecting…"}
    </span>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-0">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-4 border-b px-4 py-4 lg:px-6">
          <Skeleton className="h-4 w-16" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-64" />
          </div>
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}
