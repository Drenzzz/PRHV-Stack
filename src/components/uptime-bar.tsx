import { cn } from "cn";
import type { DayCell } from "@/database/drizzle/queries/dashboard";
import { statusColor } from "@/components/status-badge";
import { dayKey } from "@/lib/format";

// The 90-day uptime strip — Lunite's signature element (DS-004, REQ-023).
// One cell per day, colour by daily uptime, neutral when the day has no data.
// Cells are focusable with an accessible label; colour is never the only signal.

export function UptimeBar({ series, className }: { series: DayCell[]; className?: string }) {
  return (
    <ul
      className={cn("flex gap-px overflow-x-auto", className)}
      aria-label="Uptime for the last 90 days"
    >
      {series.map((cell) => {
        const bucket = uptimeBucket(cell.uptime);
        const label =
          cell.uptime == null
            ? `${cell.day}: no data`
            : `${cell.day}: ${cell.uptime.toFixed(1)}% uptime (${cell.count} checks)`;
        return (
          <li
            key={cell.day}
            className="h-8 min-w-1.5 flex-1 rounded-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title={label}
            style={{
              backgroundColor:
                cell.uptime == null ? "var(--muted)" : statusColor(bucket),
            }}
          >
            {/* sr-only text gives every cell a text equivalent — colour alone
                never carries meaning (REQ-039 / 08 §12). */}
            <span className="sr-only">{label}</span>
          </li>
        );
      })}
    </ul>
  );
}

// Map a percentage to a status bucket so the strip speaks the same status
// language as badges (DS-002): no more than 2 hues doing a status job.
function uptimeBucket(uptime: number | null): "up" | "degraded" | "down" {
  if (uptime == null) return "up";
  if (uptime >= 99.5) return "up";
  if (uptime >= 95) return "degraded";
  return "down";
}

export { dayKey };
