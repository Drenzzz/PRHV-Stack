import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { api, ApiRequestError, type MonitorListRow, type PublicStatusPage } from "../../../lib/api";
import { showApiError, redirectToLogin, isSessionExpired } from "../../../lib/errors";
import { formString } from "@/lib/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { IconExternalLink, IconTrash } from "@tabler/icons-react";

// Status pages (REQ-022): slug + publish a subset of monitors. Publishing is
// the opt-in that makes a monitor public (05 §11) — only monitors checked here
// ever appear on /status/:slug.
export default function Page() {
  const [pages, setPages] = useState<PublicStatusPage[]>([]);
  const [monitors, setMonitors] = useState<MonitorListRow[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, m] = await Promise.all([api.listStatusPages(), api.listMonitors()]);
      setPages(p.pages);
      setMonitors(m.monitors);
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
      await api.createStatusPage({
        slug: formString(form, "slug"),
        title: formString(form, "title"),
        description: formString(form, "description") || undefined,
        monitorIds: selected,
      });
      toast.success("Status page created");
      (ev.currentTarget as HTMLFormElement).reset();
      setSelected([]);
      await load();
    } catch (err) {
      if (isSessionExpired(err)) return redirectToLogin();
      if (err instanceof ApiRequestError && err.code === "VALIDATION") {
        const mapped: Record<string, string> = {};
        for (const f of err.fields) mapped[f.path] = f.reason;
        setFieldErrors(mapped);
      } else if (err instanceof ApiRequestError && err.code === "CONFLICT") {
        setFieldErrors({ slug: err.message });
        toast.error("Slug already taken");
      } else {
        showApiError(err);
      }
    } finally {
      setPending(false);
    }
  }

  async function handleDelete(page: PublicStatusPage) {
    try {
      await api.deleteStatusPage(page.id);
      toast.success("Status page deleted");
      await load();
    } catch (err) {
      if (isSessionExpired(err)) return redirectToLogin();
      showApiError(err);
    }
  }

  function origin(): string {
    return window.location.origin;
  }

  return (
    <div className="flex flex-1 flex-col gap-5 py-4 lg:px-6">
      <div>
        <h2 className="text-lg font-medium">Status pages</h2>
        <p className="text-sm text-muted-foreground">
          Public pages at <code className="font-mono">/status/&lt;slug&gt;</code>. Only monitors you select here are published.
        </p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>New status page</CardTitle>
          <CardDescription>Lowercase letters, digits and dashes (3–40 chars).</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="grid gap-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="slug">Slug</Label>
                <Input id="slug" name="slug" required placeholder="acme" />
                {fieldErrors.slug && <p className="text-xs text-destructive">{fieldErrors.slug}</p>}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="title">Title</Label>
                <Input id="title" name="title" required placeholder="Acme Services" />
                {fieldErrors.title && <p className="text-xs text-destructive">{fieldErrors.title}</p>}
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Input id="description" name="description" placeholder="Live status of our API" />
            </div>

            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium">Publish monitors</legend>
              {monitors.length === 0 && (
                <p className="text-xs text-muted-foreground">No monitors yet — create one first.</p>
              )}
              {monitors.map((m) => (
                <label key={m.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={selected.includes(m.id)}
                    onCheckedChange={(v) =>
                      setSelected((prev) => (v ? [...prev, m.id] : prev.filter((id) => id !== m.id)))
                    }
                  />
                  <span>{m.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{m.url}</span>
                </label>
              ))}
            </fieldset>

            <div>
              <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create status page"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="border-t">
        <h3 className="py-3 text-sm font-medium">Your pages</h3>
        {state === "loading" && <Skeleton className="h-16 w-full" />}
        {state === "ready" && pages.length === 0 && (
          <p className="pb-6 text-sm text-muted-foreground">No status pages yet.</p>
        )}
        {state === "ready" && pages.length > 0 && (
          <ul className="divide-y">
            {pages.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{p.title}</p>
                  <p className="font-mono text-xs text-muted-foreground">/status/{p.slug}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <a
                    href={`${origin()}/status/${p.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                  >
                    <IconExternalLink className="size-3.5" />
                    Open
                  </a>
                  <Button size="sm" variant="ghost" aria-label={`Delete ${p.title}`} onClick={() => void handleDelete(p)}>
                    <IconTrash className="size-4" />
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
