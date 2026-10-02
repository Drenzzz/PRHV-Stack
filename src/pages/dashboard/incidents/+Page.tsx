import { useCallback, useEffect, useState } from "react";
import { api, type IncidentRow } from "../../../lib/api";
import { showApiError, redirectToLogin, isSessionExpired } from "../../../lib/errors";
import { IncidentLog } from "../../../components/incident-log";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";

// Account-wide incident timeline (REQ-020). Newest first, same renderer the
// monitor detail page uses so both surfaces speak the same language.
export default function Page() {
  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async () => {
    try {
      const res = await api.allIncidents(200);
      setIncidents(res.incidents);
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

  const open = incidents.filter((i) => i.status === "open");

  return (
    <div className="flex flex-1 flex-col gap-5 py-4 lg:px-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">Incidents</h2>
          <p className="text-sm text-muted-foreground">Timeline across all of your monitors.</p>
        </div>
        <Badge variant={open.length > 0 ? "destructive" : "secondary"}>
          {open.length > 0 ? `${open.length} open` : "None open"}
        </Badge>
      </div>

      <div className="border-t">
        {state === "loading" && (
          <div className="space-y-3 py-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        )}
        {state === "error" && (
          <p className="py-8 text-sm text-muted-foreground">
            Couldn&apos;t load incidents.{" "}
            <button className="underline underline-offset-4" onClick={() => void load()}>Retry</button>
          </p>
        )}
        {state === "ready" && incidents.length === 0 && (
          <div className="py-8">
            <Empty>
              <EmptyHeader>
                <EmptyTitle>All quiet</EmptyTitle>
                <EmptyDescription>No incidents across your monitors in this window.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        )}
        {state === "ready" && incidents.length > 0 && <IncidentLog incidents={incidents} />}
      </div>
    </div>
  );
}
