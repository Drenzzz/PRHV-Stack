import { Badge } from "@/components/ui/badge";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { formatRelative } from "@/lib/format";
import type { IncidentRow } from "@/server/incidents";

// Incident log on the monitor detail page (REQ-030), backed by the timeline
// endpoint (REQ-020). Newest first, status as text — never colour alone.
export function IncidentLog({ incidents }: { incidents: IncidentRow[] }) {
  if (incidents.length === 0) {
    return (
      <div className="px-4 py-6">
        <Empty>
          <EmptyHeader>
            <EmptyTitle>All quiet</EmptyTitle>
            <EmptyDescription>No incidents in this window.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <ul className="divide-y">
      {incidents.map((inc) => (
        <li key={inc.id} className="flex items-start justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm">
              {inc.reason === "recovered" ? "Recovered" : "Incident opened"}
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              started {formatRelative(inc.startedAt)}
              {inc.endedAt ? ` · ended ${formatRelative(inc.endedAt)}` : ""}
            </p>
          </div>
          <Badge variant={inc.status === "open" ? "destructive" : "secondary"} className="shrink-0">
            {inc.status === "open" ? "Open" : "Resolved"}
          </Badge>
        </li>
      ))}
    </ul>
  );
}
