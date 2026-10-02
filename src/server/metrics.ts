import { enhance, type UniversalHandler } from "@universal-middleware/core";
import { notFound, unauthorized, validation } from "./http";
import { requireUserId } from "./session";
import {
  BUCKET_SECONDS,
  RANGE_SECONDS,
  metricsFromRaw,
  metricsFromRollups,
  monitorExistsForUser,
} from "../database/drizzle/queries/checks";

// Metrics API (REQ-017): uptime + percentile series per monitor.
// Window ≤7d reads raw checks (exact, CF-003); longer windows read rollups
// (STEP-M2-02, approximations noted in the response).

function metricsId(request: Request): string {
  // Matches "/api/monitors/:id/metrics".
  return new URL(request.url).pathname.split("/")[3] ?? "";
}

export const metricsHandler: UniversalHandler = enhance(
  async (request, _context, runtime) => {
    const userId = await requireUserId(request, runtime);
    if (!userId) return unauthorized();

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
