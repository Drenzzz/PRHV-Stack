import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { api, ApiRequestError, type PublicApiKey } from "../lib/api";
import { showApiError, redirectToLogin, isSessionExpired } from "../lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatRelative } from "@/lib/format";
import { IconCopy, IconPlus, IconTrash } from "@tabler/icons-react";

// API keys in Settings (REQ-025): create shows the secret exactly once,
// list never returns it, revoke takes effect on the next request.
export function ApiKeyPanel() {
  const [keys, setKeys] = useState<PublicApiKey[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [pending, setPending] = useState(false);
  const [name, setName] = useState("");
  const [freshSecret, setFreshSecret] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.listApiKeys();
      setKeys(res.keys);
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

  async function handleCreate(ev: React.FormEvent) {
    ev.preventDefault();
    if (!name.trim()) return;
    setPending(true);
    try {
      const res = await api.createApiKey(name.trim());
      setFreshSecret(res.secret);
      setName("");
      await load();
    } catch (err) {
      if (isSessionExpired(err)) return redirectToLogin();
      showApiError(err);
    } finally {
      setPending(false);
    }
  }

  async function handleRevoke(id: string) {
    try {
      await api.revokeApiKey(id);
      toast.success("Key revoked", { description: "Bearer requests with it fail with 401." });
      await load();
    } catch (err) {
      if (isSessionExpired(err)) return redirectToLogin();
      showApiError(err);
    }
  }

  async function copySecret() {
    if (!freshSecret) return;
    try {
      await navigator.clipboard.writeText(freshSecret);
      toast.success("Copied");
    } catch {
      toast.error("Copy failed", { description: "Select the secret manually." });
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3">
        <div className="grid w-full max-w-sm gap-2">
          <Label htmlFor="key-name">New key name</Label>
          <Input id="key-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="CI runner" maxLength={100} />
        </div>
        <Button type="submit" disabled={pending || !name.trim()}>
          <IconPlus className="size-4" />
          {pending ? "Creating…" : "Create key"}
        </Button>
      </form>

      <div className="border-t pt-3">
        {state === "loading" && <Skeleton className="h-16 w-full" />}
        {state === "error" && <p className="py-4 text-sm text-muted-foreground">Couldn&apos;t load keys.</p>}
        {state === "ready" && keys.length === 0 && (
          <p className="py-4 text-sm text-muted-foreground">No API keys yet. Keys grant read-only access to your monitors, metrics, and incidents.</p>
        )}
        {state === "ready" && keys.length > 0 && (
          <ul className="divide-y">
            {keys.map((k) => (
              <li key={k.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{k.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {k.prefix}… · last used {k.lastUsedAt ? formatRelative(k.lastUsedAt) : "never"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={k.revokedAt ? "secondary" : "outline"}>{k.revokedAt ? "Revoked" : "Active"}</Badge>
                  {!k.revokedAt && (
                    <Button size="sm" variant="ghost" aria-label={`Revoke ${k.name}`} onClick={() => void handleRevoke(k.id)}>
                      <IconTrash className="size-4" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Secret-once dialog: this is the only time the plaintext exists. */}
      <Dialog open={freshSecret !== null} onOpenChange={(open) => !open && setFreshSecret(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save your API key</DialogTitle>
            <DialogDescription>
              This secret is shown once and never again. Store it somewhere safe — we only keep its hash.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto whitespace-nowrap rounded-md bg-muted px-3 py-2 font-mono text-xs">
              {freshSecret}
            </code>
            <Button size="sm" variant="outline" onClick={() => void copySecret()}>
              <IconCopy className="size-4" />
              Copy
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setFreshSecret(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
