import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { statusColor } from "@/components/status-badge";
import { formatMs } from "@/lib/format";
import type { BucketRow } from "@/database/drizzle/queries/checks";

// Latency chart (REQ-030): p50/p95/p99 series with a range switcher. Values
// render through formatMs so units are always shown (DS-003); the accessible
// fallback is a data table next to it (08 §12).

const chartConfig = {
  p50: { label: "p50", color: "var(--chart-1)" },
  p95: { label: "p95", color: "var(--chart-2)" },
  p99: { label: "p99", color: "var(--chart-3)" },
} satisfies ChartConfig;

export function LatencyChart({ series }: { series: BucketRow[] }) {
  const rows = useMemo(
    () =>
      series.map((b) => ({
        t: new Date(b.t).getTime(),
        label: shortTime(b.t),
        p50: b.p50 ?? undefined,
        p95: b.p95 ?? undefined,
        p99: b.p99 ?? undefined,
      })),
    [series],
  );

  if (rows.every((r) => r.p50 == null && r.p95 == null && r.p99 == null)) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No latency data in this window.</p>;
  }

  return (
    <>
      <ChartContainer config={chartConfig} className="h-56 w-full">
        <LineChart data={rows} margin={{ left: 8, right: 12, top: 8 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/60" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={40}
          />
          <YAxis tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v}ms`} width={54} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Line dataKey="p50" type="monotone" stroke={chartConfig.p50.color} strokeWidth={2} dot={false} connectNulls />
          <Line dataKey="p95" type="monotone" stroke={chartConfig.p95.color} strokeWidth={2} dot={false} connectNulls />
          <Line dataKey="p99" type="monotone" stroke={chartConfig.p99.color} strokeWidth={2} dot={false} connectNulls />
        </LineChart>
      </ChartContainer>

      {/* Keyboard/screen-reader fallback: exact values as a table (08 §12). */}
      <table className="sr-only">
        <caption>Latency percentiles by bucket</caption>
        <thead>
          <tr>
            <th scope="col">Time</th>
            <th scope="col">p50</th>
            <th scope="col">p95</th>
            <th scope="col">p99</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.t}>
              <th scope="row">{new Date(r.t).toISOString()}</th>
              <td>{formatMs(r.p50 ?? null)}</td>
              <td>{formatMs(r.p95 ?? null)}</td>
              <td>{formatMs(r.p99 ?? null)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function shortTime(iso: string): string {
  const d = new Date(iso);
  return d.toISOString().slice(11, 16);
}

export { statusColor };
