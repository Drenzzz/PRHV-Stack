import { navigate } from "vike/client/router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { MonitorForm } from "../../../../components/monitor-form";

// Create monitor (REQ-005). Server is the source of truth for validation.
export default function Page() {
  return (
    <div className="flex flex-1 flex-col gap-5 py-4 lg:px-6">
      <div>
        <h2 className="text-lg font-medium">New monitor</h2>
        <p className="text-sm text-muted-foreground">
          Add an endpoint to watch. The first probe runs immediately.
        </p>
      </div>
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
          <CardDescription>
            Interval, timeout, and contract expectations control how often and how strictly Lunite probes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MonitorForm onSaved={() => navigate("/dashboard")} />
        </CardContent>
      </Card>
    </div>
  );
}
