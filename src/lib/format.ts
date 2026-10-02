// Number/time formatters for status surfaces (DS-003): one place, always
// tabular-friendly, unit always shown.

export function formatMs(value: number | null | undefined): string {
  if (value == null) return "—";
  if (value >= 1000) return `${(value / 1000).toFixed(2)} s`;
  return `${Math.round(value)} ms`;
}

export function formatUptime(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value.toFixed(2)}%`;
}

// 30 days ago in UTC (stable day cells).
export function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function formatRelative(timestamp: string): string {
  const then = new Date(timestamp).getTime();
  if (Number.isNaN(then)) return "—";
  const diffSec = Math.round((Date.now() - then) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}
