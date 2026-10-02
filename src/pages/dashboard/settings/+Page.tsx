import { usePageContext } from "vike-react/usePageContext";
import { ApiKeyPanel } from "../../../components/api-key-panel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Settings (REQ-029): currently API keys, which is the only Settings item with
// a binding requirement (REQ-025). Profile/password change is a non-goal (00 §5).
export default function Page() {
  const pageContext = usePageContext();
  const user = pageContext.user as { name?: string; email?: string } | undefined;

  return (
    <div className="flex flex-1 flex-col gap-5 py-4 lg:px-6">
      <div>
        <h2 className="text-lg font-medium">Settings</h2>
        <p className="text-sm text-muted-foreground">Account and API access.</p>
      </div>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Signed in as {user?.email ?? "unknown"}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {user?.name}
        </CardContent>
      </Card>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>API keys</CardTitle>
          <CardDescription>
            Read-only bearer keys for scripts and integrations. Rate limit: 60 requests per minute per key.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ApiKeyPanel />
        </CardContent>
      </Card>
    </div>
  );
}
