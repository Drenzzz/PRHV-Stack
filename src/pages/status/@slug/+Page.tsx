import { usePageContext } from "vike-react/usePageContext";
import { Head } from "vike-react/Head";
import { UptimeBar } from "../../../components/uptime-bar";
import { StatusBadge, type MonitorStatus } from "../../../components/status-badge";
import { formatRelative } from "../../../lib/format";
import type { PublicStatusPayload } from "../../../database/drizzle/queries/status";

// Public, read-only status page (REQ-022, REQ-023). SSR: core content exists
// without JavaScript (06 §1 "Public = zero friction"). Status is always paired
// with a text label — colour alone never carries meaning (REQ-039).
export default function Page() {
  const { data } = usePageContext() as { data: PublicStatusPayload };
  const allUp = data.overall === "up";
  const statusToken = allUp ? "up" : data.overall === "down" ? "down" : "unknown";

  return (
    <div className="min-h-dvh bg-background text-foreground">
      {/* SEO/OG tags — Head inside the tree so the payload is guaranteed. */}
      <Head>
        <title>{data.title}</title>
        <meta name="description" content={data.description ?? `Current status of ${data.title} — powered by Lunite.`} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={data.title} />
        <meta property="og:description" content={data.description ?? `Current status of ${data.title} — powered by Lunite.`} />
        <meta property="og:url" content={`https://lunite.dev/status/${data.slug}`} />
      </Head>

      <div className="mx-auto max-w-3xl px-6 py-12">
        <header className="mb-8 flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">{data.title}</h1>
          {data.description && (
            <p className="text-sm text-muted-foreground">{data.description}</p>
          )}
          <p
            className="inline-flex w-fit items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium"
            style={{
              color: `var(--status-${statusToken})`,
              backgroundColor: `color-mix(in oklch, var(--status-${statusToken}) 12%, transparent)`,
            }}
            role="status"
          >
            <StatusBadge status={statusToken as MonitorStatus} />
            {allUp
              ? "All systems operational"
              : data.overall === "down"
                ? "Some systems are having issues"
                : "Status unavailable"}
          </p>
        </header>

        {data.activeIncidents.length > 0 && (
          <section className="mb-6 rounded-lg border border-[var(--status-down)]/40 bg-[var(--status-down)]/5 p-4" aria-label="Active incidents">
            <h2 className="mb-2 text-sm font-semibold text-[var(--status-down)]">Active incidents</h2>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {data.activeIncidents.map((inc, i) => (
                <li key={i}>
                  <span className="font-medium text-foreground">{inc.monitorName}</span> — investigating since {formatRelative(inc.startedAt)}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-label="Service status" className="space-y-3">
          {data.monitors.map((m) => (
            <article key={m.monitorId} className="rounded-xl border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="truncate text-sm font-medium">{m.name}</h2>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {m.uptime90d == null ? "—" : `${m.uptime90d.toFixed(2)}% uptime`}
                  </span>
                  <StatusBadge status={(m.active ? (m.status as MonitorStatus) : "paused") as MonitorStatus} />
                </div>
              </div>
              <UptimeBar series={m.bars} />
            </article>
          ))}
        </section>

        <footer className="mt-10 text-center text-xs text-muted-foreground">
          Powered by Lunite — uptime &amp; latency monitoring
        </footer>
      </div>
    </div>
  );
}
