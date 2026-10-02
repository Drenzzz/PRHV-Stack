import { enhance, type UniversalHandler } from "@universal-middleware/core";
import { notFound, unauthorized, validation } from "./http";
import { requireUserId } from "./session";
import { requirePrincipal } from "./auth-bearer";
import {
  BUCKET_SECONDS,
  RANGE_SECONDS,
  metricsFromRaw,
  metricsFromRollups,
  monitorExistsForUser,
} from "../database/drizzle/queries/checks";
import { uptimeDaily } from "../database/drizzle/queries/dashboard";

// Metrics API (REQ-017): uptime + percentile series per monitor.
// Window ≤7d reads raw checks (exact, CF-003); longer windows read rollups
// (STEP-M2-02, approximations noted in the response).

function metricsId(request: Request): string {
  // Matches "/api/monitors/:id/metrics".
  return new URL(request.url).pathname.split("/")[3] ?? "";
}

export const metricsHandler: UniversalHandler = enhance(
  async (request, _context, runtime) => {
    const principal = await requirePrincipal(request, runtime);
    if (!principal) return unauthorized();
    const userId = principal.userId;

    const url = new URL(request.url);
    const id = metricsId(request);
    const range = url.searchParams.get("range") ?? "24h";
    const bucket = url.searchParams.get("bucket") ?? "5m";

    if (!(range in RANGE_SECONDS) || !(bucket in BUCKET_SECONDS)) {
      return validation(
        "Invalid range or bucket",
        [
          ...(range in RANGE_SECONDS ? [] : [{ path: "range", reason: `must be one of ${Object.keys(RANGE_SECONDS).join(", ")}` }]),
          ...(bucket in BUCKET_SECONDS ? [] : [{ path: "bucket", reason: `must be one of ${Object.keys(BUCKET_SECONDS).join(", ")}` }]),
        ],
      );
    }

    if (!(await monitorExistsForUser(id, userId))) return notFound();

    // CF-003: raw checks are retained 7 days — windows beyond that read rollups
    // (bucket-level approximation, documented in the OpenAPI descriptions at M4).
    const RAW_MAX_SEC = RANGE_SECONDS["7d"];
    const result =
      RANGE_SECONDS[range] <= RAW_MAX_SEC
        ? await metricsFromRaw(id, range, bucket)
        : await metricsFromRollups(id, range, bucket);
    return Response.json(result);
  },
  { name: "lunite:metrics", path: "/api/monitors/:id/metrics", method: "GET", immutable: false },
);

// 90-day uptime bar data (REQ-023): one cell per day, null = no data.
export const uptimeDailyHandler: UniversalHandler = enhance(
  async (request, _context, runtime) => {
    const principal = await requirePrincipal(request, runtime);
    if (!principal) return unauthorized();
    const userId = principal.userId;

    const id = metricsId(request);
    if (!(await monitorExistsForUser(id, userId))) return notFound();

    const raw = new URL(request.url).searchParams.get("days") ?? "90";
    const days = parseInt(raw, 10);
    if (!Number.isInteger(days) || days < 1 || days > 366) {
      return validation("Invalid days", [{ path: "days", reason: "must be an integer between 1 and 366" }]);
    }

    const series = await uptimeDaily(id, days);
    return Response.json({ days, series });
  },
  { name: "lunite:uptime-daily", path: "/api/monitors/:id/uptime-daily", method: "GET", immutable: false },
);
