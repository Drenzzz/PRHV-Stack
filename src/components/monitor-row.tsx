import { Badge } from "@/components/ui/badge";
import { StatusBadge, type MonitorStatus } from "@/components/status-badge";
import { formatMs, formatUptime } from "@/lib/format";
import type { MonitorListRow } from "@/database/drizzle/queries/dashboard";

// One row in the monitor list (REQ-029). Values are tabular so live updates
// don't jitter (DS-003); status carries icon+text, never colour alone (REQ-039).

export function MonitorRow({
  monitor,
  onNavigate,
}: {
  monitor: MonitorListRow;
  onNavigate: (id: string) => void;
}) {
  const status = (monitor.currentStatus ?? "unknown") as MonitorStatus;

  return (
    <li>
      <button
        type="button"
        onClick={() => onNavigate(monitor.id)}
        aria-label={`${monitor.name} — open monitor detail`}
        className="flex w-full flex-col gap-2 border-b px-4 py-4 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:gap-4 lg:px-6"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-3">
            <StatusBadge status={status} />
            <span className="truncate font-medium">{monitor.name}</span>
            {!monitor.active && (
              <Badge variant="secondary" className="shrink-0 text-muted-foreground">
                Paused
              </Badge>
            )}
          </div>
          <span className="truncate font-mono text-xs text-muted-foreground">{monitor.url}</span>
        </div>

        <dl className="flex shrink-0 items-center gap-4 font-mono text-xs tabular-nums text-muted-foreground">
          <div className="flex flex-col items-end">
            <dt className="text-[10px] uppercase tracking-wide">Uptime 30d</dt>
            <dd className="text-foreground">{formatUptime(monitor.uptime30d)}</dd>
          </div>
          <div className="flex flex-col items-end">
            <dt className="text-[10px] uppercase tracking-wide">Last</dt>
            <dd className="text-foreground">{formatMs(monitor.lastLatencyMs)}</dd>
          </div>
        </dl>
      </button>
    </li>
  );
}
