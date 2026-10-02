import { useCallback, useEffect, useState } from "react";
import { usePageContext } from "vike-react/usePageContext";
import { navigate } from "vike/client/router";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MonitorForm } from "../../../../../components/monitor-form";
import { api, type Monitor } from "../../../../../lib/api";
import { showApiError, redirectToLogin, isSessionExpired } from "../../../../../lib/errors";
import { toast } from "sonner";
import { IconChevronLeft, IconTrash } from "@tabler/icons-react";

// Edit monitor (REQ-005/007) + delete with confirm (REQ-008).
export default function Page() {
  const pageContext = usePageContext();
  const monitorId = pageContext.routeParams?.id;
  const [monitor, setMonitor] = useState<Monitor | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!monitorId) return;
    try {
      const res = await api.getMonitor(monitorId);
      setMonitor(res.monitor);
      setState("ready");
    } catch (err) {
      if (isSessionExpired(err)) return redirectToLogin();
      showApiError(err);
      setState("error");
    }
  }, [monitorId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDelete() {
    if (!monitorId) return;
    setDeleting(true);
    try {
      await api.deleteMonitor(monitorId);
      toast.success("Monitor deleted");
      await navigate("/dashboard");
    } catch (err) {
      if (isSessionExpired(err)) return redirectToLogin();
      showApiError(err);
      setDeleting(false);
      setConfirmOpen(false);
    }
  }

  if (state === "loading") {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-96 w-full max-w-2xl" />
      </div>
    );
  }

  if (state === "error" || !monitor) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
        <p className="text-sm text-muted-foreground">Couldn&apos;t load this monitor.</p>
        <Button size="sm" variant="outline" onClick={() => navigate("/dashboard")}>
          <IconChevronLeft className="size-4" />
          Back to monitors
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-5 py-4 lg:px-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={() => navigate(`/dashboard/monitors/${monitor.id}`)}
            className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <IconChevronLeft className="size-3.5" />
            Back to detail
          </button>
          <h2 className="text-lg font-medium">Edit monitor</h2>
        </div>
        <Button size="sm" variant="destructive" onClick={() => setConfirmOpen(true)}>
          <IconTrash className="size-4" />
          Delete
        </Button>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
          <CardDescription>Changes apply to the next probe.</CardDescription>
        </CardHeader>
        <CardContent>
          <MonitorForm monitor={monitor} onSaved={() => navigate(`/dashboard/monitors/${monitor.id}`)} />
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete monitor?</DialogTitle>
            <DialogDescription>
              This removes <span className="font-medium">{monitor.name}</span> from scheduling and all
              owner views, including its status page. Check history stops being recorded.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void handleDelete()} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete monitor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
