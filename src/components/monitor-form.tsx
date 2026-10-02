import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formString } from "@/lib/form";
import { api, ApiRequestError, type Monitor } from "@/lib/api";
import { showApiError, redirectToLogin, isSessionExpired } from "@/lib/errors";
import { toast } from "sonner";

const METHODS = ["GET", "HEAD", "POST"] as const;

// Create/edit monitor form (REQ-005, REQ-007). Server is the source of truth:
// VALIDATION.fields from the API is rendered inline (04 §3), not only in JS.
export function MonitorForm({ monitor, onSaved }: { monitor?: Monitor; onSaved: () => void }) {
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  async function handleSubmit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    setError("");
    setFieldErrors({});
    setPending(true);

    const form = new FormData(ev.currentTarget);
    const expectedRaw = formString(form, "expectedKeywords");
    // jsonb columns type as {} in Drizzle — narrow the form values ourselves.
    const method = (METHODS as readonly string[]).includes(formString(form, "method"))
      ? (formString(form, "method") as (typeof METHODS)[number])
      : "GET";
    const payload = {
      name: formString(form, "name"),
      url: formString(form, "url"),
      method,
      intervalSec: Number(formString(form, "intervalSec")) || 60,
      timeoutMs: Number(formString(form, "timeoutMs")) || 10000,
      expectedStatus: formString(form, "expectedStatus")
        ? Number(formString(form, "expectedStatus"))
        : undefined,
      expectedKeywords: expectedRaw
        ? expectedRaw.split(",").map((k) => k.trim()).filter(Boolean)
        : [],
      sslCheck: form.get("sslCheck") === "on",
    };

    try {
      if (monitor) {
        await api.updateMonitor(monitor.id, payload);
        toast.success("Monitor updated");
      } else {
        await api.createMonitor(payload);
        toast.success("Monitor created");
      }
      onSaved();
    } catch (err) {
      if (isSessionExpired(err)) return redirectToLogin();
      if (err instanceof ApiRequestError && err.code === "VALIDATION") {
        const mapped: Record<string, string> = {};
        for (const f of err.fields) mapped[f.path] = f.reason;
        setFieldErrors(mapped);
        setError(err.message);
      } else {
        showApiError(err);
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="name">Name</FieldLabel>
          <Input id="name" name="name" required defaultValue={monitor?.name} placeholder="Hayainime API" />
          {fieldErrors.name && <FieldDescription className="text-destructive">{fieldErrors.name}</FieldDescription>}
        </Field>

        <Field>
          <FieldLabel htmlFor="url">URL</FieldLabel>
          <Input id="url" name="url" type="url" required defaultValue={monitor?.url} placeholder="https://example.com/health" />
          <FieldDescription>HTTP or HTTPS endpoint to probe.</FieldDescription>
          {fieldErrors.url && <FieldDescription className="text-destructive">{fieldErrors.url}</FieldDescription>}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <Label htmlFor="method">Method</Label>
            <Select name="method" defaultValue={monitor?.method ?? "GET"}>
              <SelectTrigger id="method" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METHODS.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <Label htmlFor="intervalSec">Interval (seconds)</Label>
            <Input
              id="intervalSec"
              name="intervalSec"
              type="number"
              min={30}
              step={30}
              defaultValue={monitor?.intervalSec ?? 60}
            />
            <FieldDescription>Minimum 30s.</FieldDescription>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <Label htmlFor="timeoutMs">Timeout (ms)</Label>
            <Input
              id="timeoutMs"
              name="timeoutMs"
              type="number"
              min={1000}
              step={500}
              defaultValue={monitor?.timeoutMs ?? 10000}
            />
          </Field>

          <Field>
            <Label htmlFor="expectedStatus">Expected status (optional)</Label>
            <Input
              id="expectedStatus"
              name="expectedStatus"
              type="number"
              min={100}
              max={599}
              placeholder="200"
              defaultValue={monitor?.expectedStatus ?? ""}
            />
          </Field>
        </div>

        <Field>
          <Label htmlFor="expectedKeywords">Expected keywords (optional)</Label>
          <Input
            id="expectedKeywords"
            name="expectedKeywords"
            placeholder='"status":"ok", healthy'
            defaultValue={Array.isArray(monitor?.expectedKeywords) ? (monitor.expectedKeywords as string[]).join(", ") : ""}
          />
          <FieldDescription>Comma-separated; all must appear in the response body.</FieldDescription>
        </Field>

        <Field>
          <div className="flex items-center gap-2">
            <Checkbox id="sslCheck" name="sslCheck" defaultChecked={monitor?.sslCheck ?? false} />
            <Label htmlFor="sslCheck">Check SSL certificate expiry</Label>
          </div>
        </Field>

        {error && (
          <p role="alert" className="text-sm text-destructive">{error}</p>
        )}

        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : monitor ? "Save changes" : "Create monitor"}
        </Button>
      </FieldGroup>
    </form>
  );
}
