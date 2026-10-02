import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { api, ApiRequestError, type PublicChannel } from "../../../lib/api";
import { showApiError, redirectToLogin, isSessionExpired } from "../../../lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formString } from "@/lib/form";

// Telegram channels (REQ-031): create with an optional own token (falls back
// to the platform bot), masked afterwards (REQ-033), and test-send.
export default function Page() {
  const [channels, setChannels] = useState<PublicChannel[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.listChannels();
      setChannels(res.channels);
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

  async function handleCreate(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    setFieldErrors({});
    setPending(true);
    const form = new FormData(ev.currentTarget);
    try {
      await api.createChannel({
        chatId: formString(form, "chatId"),
        token: formString(form, "token") || undefined,
      });
      toast.success("Channel added", { description: "Run a test send to verify it." });
      (ev.currentTarget as HTMLFormElement).reset();
      await load();
    } catch (err) {
      if (isSessionExpired(err)) return redirectToLogin();
      if (err instanceof ApiRequestError && err.code === "VALIDATION") {
        const mapped: Record<string, string> = {};
        for (const f of err.fields) mapped[f.path] = f.reason;
        setFieldErrors(mapped);
      } else {
        showApiError(err);
      }
    } finally {
      setPending(false);
    }
  }

  async function handleTest(id: string) {
    setTestingId(id);
    try {
      const res = await api.testChannel(id);
      if (res.delivered) {
        toast.success("Delivered", { description: "Telegram accepted the test message." });
      } else {
        toast.error("Not delivered", { description: res.error ?? "Telegram rejected the request — check token and chat id." });
      }
      await load();
    } catch (err) {
      if (isSessionExpired(err)) return redirectToLogin();
      showApiError(err);
    } finally {
      setTestingId(null);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-5 py-4 lg:px-6">
      <div>
        <h2 className="text-lg font-medium">Alert channels</h2>
        <p className="text-sm text-muted-foreground">
          Where Lunite sends incident and recovery messages. Token is encrypted at rest and never shown again.
        </p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Add Telegram channel</CardTitle>
          <CardDescription>
            Chat with your bot first (<code className="font-mono">/start</code>), then find the chat id via{" "}
            <code className="font-mono">getUpdates</code>. Leave the token empty to use the platform bot.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="chatId">Chat ID</Label>
              <Input id="chatId" name="chatId" required placeholder="-1003970173220" />
              {fieldErrors.chatId && <p className="text-xs text-destructive">{fieldErrors.chatId}</p>}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="token">Bot token (optional)</Label>
              <Input id="token" name="token" type="password" placeholder="Platform bot used if empty" autoComplete="off" />
              {fieldErrors.token && <p className="text-xs text-destructive">{fieldErrors.token}</p>}
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Add channel"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="border-t">
        {state === "loading" && <Skeleton className="mt-4 h-16 w-full" />}
        {state === "error" && <p className="py-8 text-sm text-muted-foreground">Couldn&apos;t load channels.</p>}
        {state === "ready" && channels.length === 0 && (
          <p className="py-8 text-sm text-muted-foreground">No channels yet.</p>
        )}
        {state === "ready" && channels.length > 0 && (
          <ul className="divide-y">
            {channels.map((ch) => (
              <li key={ch.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="font-mono text-sm">{ch.chatId}</p>
                  <p className="text-xs text-muted-foreground">
                    Telegram · token: {ch.hasOwnToken ? ch.token : "platform bot"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={ch.verified ? "secondary" : "outline"}>
                    {ch.verified ? "Verified" : "Not tested"}
                  </Badge>
                  <Button size="sm" variant="outline" disabled={testingId === ch.id} onClick={() => void handleTest(ch.id)}>
                    {testingId === ch.id ? "Sending…" : "Send test"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
