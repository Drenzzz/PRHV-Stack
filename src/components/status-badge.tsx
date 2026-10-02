import { cn } from "cn";
import { IconCircleCheck, IconCircleX, IconCircleMinus, IconCircleDashed, IconPlayerPause } from "@tabler/icons-react";

// Single source of status rendering (DS-002, 08 §4). Every status surface —
// badge, row dot, chart band, uptime cell — routes through statusColor() or
// <StatusBadge>. Status hue never encodes anything else; brand accent never
// means status.

export type MonitorStatus = "up" | "down" | "degraded" | "paused" | "unknown";

const STATUS_LABEL: Record<MonitorStatus, string> = {
  up: "Up",
  down: "Down",
  degraded: "Degraded",
  paused: "Paused",
  unknown: "Unknown",
};

const STATUS_ICON: Record<MonitorStatus, React.ReactNode> = {
  up: <IconCircleCheck className="size-3.5" aria-hidden />,
  down: <IconCircleX className="size-3.5" aria-hidden />,
  degraded: <IconCircleMinus className="size-3.5" aria-hidden />,
  paused: <IconPlayerPause className="size-3.5" aria-hidden />,
  unknown: <IconCircleDashed className="size-3.5" aria-hidden />,
};

// CSS variable per status — charts/uptimes read this instead of literals.
export function statusColor(status: MonitorStatus): string {
  return `var(--status-${status})`;
}

export function statusLabel(status: MonitorStatus): string {
  return STATUS_LABEL[status];
}

export function StatusBadge({
  status,
  className,
}: {
  status: MonitorStatus;
  className?: string;
}) {
  // Colour is never the only signal: icon + text always accompany the hue
  // (DS-002 / 08 §12, REQ-039).
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium",
        className,
      )}
      style={{ color: statusColor(status) }}
    >
      {STATUS_ICON[status]}
      {STATUS_LABEL[status]}
    </span>
  );
}
