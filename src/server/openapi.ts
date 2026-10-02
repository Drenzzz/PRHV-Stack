import { enhance, type UniversalHandler } from "@universal-middleware/core";
import { renderApiReference } from "@scalar/client-side-rendering";

// OpenAPI spec + Scalar UI (REQ-027). The spec mirrors the actual route
// behavior implemented in src/server/*: same paths, same error taxonomy (04 §3),
// same auth model (session cookie OR read-only bearer). Registered before the
// Vike fallthrough in hono.ts so the API wins over page routing (02 §8).

const ERROR_SCHEMA = {
  type: "object",
  properties: {
    code: {
      type: "string",
      enum: ["VALIDATION", "UNAUTHENTICATED", "FORBIDDEN", "NOT_FOUND", "CONFLICT", "RATE_LIMITED", "TARGET_BLOCKED", "INTERNAL"],
    },
    message: { type: "string" },
    fields: {
      type: "array",
      items: {
        type: "object",
        properties: { path: { type: "string" }, reason: { type: "string" } },
      },
    },
  },
  required: ["code", "message"],
} as const;

function errorResponse(description: string) {
  return { description, content: { "application/json": { schema: ERROR_SCHEMA } } };
}

const UNAUTH = errorResponse("Missing or invalid session / API key");
const NF = errorResponse("Resource missing or not owned (indistinguishable by design)");
const VAL = errorResponse("Input failed schema validation");
const RL = { description: "Rate limit exceeded", headers: { "Retry-After": { schema: { type: "integer" }, description: "Seconds until the window resets" } }, content: { "application/json": { schema: ERROR_SCHEMA } } };

export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "Lunite API",
    version: "1.0.0",
    description:
      "Uptime & latency monitoring API. All app routes accept either a Better Auth session cookie " +
      "(httpOnly) or — for read-only routes — an API key via `Authorization: Bearer <secret>`. " +
      "Rate limits: auth 10/min/IP, session 100/min, API key 60/min. " +
      "Long metric windows (>7d) serve bucket-level approximations from rollups; exact percentiles cover ≤7 days.",
  },
  servers: [{ url: "/" }],
  components: {
    parameters: {
      MonitorId: { name: "id", in: "path", required: true, schema: { type: "string" }, description: "Monitor id" },
      PagingLimit: { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 200, default: 50 } },
      PagingCursor: { name: "cursor", in: "query", schema: { type: "integer", minimum: 0, default: 0 } },
    },
    securitySchemes: {
      sessionCookie: { type: "apiKey", in: "cookie", name: "better-auth.session_token" },
      bearerAuth: { type: "http", scheme: "bearer", description: "Read-only API key (`lun_…`) created in Settings." },
    },
  },
  security: [{ sessionCookie: [] }],
  tags: [
    { name: "Auth", description: "Better Auth endpoints (native response shapes)" },
    { name: "Monitors" },
    { name: "Metrics" },
    { name: "Incidents" },
    { name: "Channels" },
    { name: "Status pages" },
    { name: "API keys" },
    { name: "Live" },
  ],
  paths: {
    "/api/auth/sign-up/email": {
      post: {
        tags: ["Auth"], summary: "Register", security: [],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["email", "password", "name"], properties: { email: { type: "string", format: "email" }, password: { type: "string", minLength: 8 }, name: { type: "string" } } } } } },
        responses: { 200: { description: "Account created, session cookie set" }, 400: { description: "Email exists or weak password" } },
      },
    },
    "/api/auth/sign-in/email": {
      post: {
        tags: ["Auth"], summary: "Log in", security: [],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["email", "password"], properties: { email: { type: "string", format: "email" }, password: { type: "string" } } } } } },
        responses: { 200: { description: "Session cookie set" }, 401: { description: "Generic invalid credentials (no user enumeration)" } },
      },
    },
    "/api/auth/sign-out": { post: { tags: ["Auth"], summary: "Log out", responses: { 200: { description: "Cookie cleared" }, 401: UNAUTH } } },
    "/api/auth/get-session": { get: { tags: ["Auth"], summary: "Current session", responses: { 200: { description: "User object or null" } } } },

    "/api/monitors": {
      get: {
        tags: ["Monitors"], summary: "List own monitors (session or API key)",
        responses: { 200: { description: "Enriched monitor list: status, lastLatencyMs, uptime30d" }, 401: UNAUTH, 429: RL },
      },
      post: {
        tags: ["Monitors"], summary: "Create monitor (session only)",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["name", "url"], properties: { name: { type: "string", maxLength: 100 }, url: { type: "string", pattern: "^https?://" }, method: { type: "string", enum: ["GET", "HEAD", "POST"], default: "GET" }, intervalSec: { type: "integer", minimum: 30, default: 60 }, timeoutMs: { type: "integer", minimum: 1000, default: 10000 }, expectedStatus: { type: "integer", minimum: 100, maximum: 599 }, expectedKeywords: { type: "array", items: { type: "string" } }, sslCheck: { type: "boolean", default: false } } } } } },
        responses: { 201: { description: "Monitor created, scheduled immediately" }, 401: UNAUTH, 422: VAL, 409: errorResponse("Monitor limit reached (20/user)") },
      },
    },
    "/api/monitors/{id}": {
      get: { tags: ["Monitors"], summary: "Get monitor (session or API key)", security: [{ sessionCookie: [] }, { bearerAuth: [] }], parameters: [{ $ref: "#/components/parameters/MonitorId" }], responses: { 200: { description: "Monitor" }, 401: UNAUTH, 404: NF } },
      patch: { tags: ["Monitors"], summary: "Update monitor (session only)", parameters: [{ $ref: "#/components/parameters/MonitorId" }], responses: { 200: { description: "Updated" }, 401: UNAUTH, 404: NF, 422: VAL } },
      delete: { tags: ["Monitors"], summary: "Delete monitor (session only)", parameters: [{ $ref: "#/components/parameters/MonitorId" }], responses: { 204: { description: "Deleted" }, 401: UNAUTH, 404: NF } },
    },
    "/api/monitors/{id}/check": {
      post: { tags: ["Monitors"], summary: "Check now — schedule an immediate probe (session only)", parameters: [{ $ref: "#/components/parameters/MonitorId" }], responses: { 202: { description: "Queued for the next worker tick" }, 401: UNAUTH, 404: NF, 409: errorResponse("Monitor is paused") } },
    },
    "/api/monitors/{id}/metrics": {
      get: {
        tags: ["Metrics"], summary: "Uptime + percentile series", security: [{ sessionCookie: [] }, { bearerAuth: [] }],
        description: "range: 1h|24h|7d|30d|90d, bucket: 5m|1h. Windows ≤7d read raw checks (exact percentiles); longer windows read rollups (bucket-level approximation).",
        parameters: [{ $ref: "#/components/parameters/MonitorId" }, { name: "range", in: "query", schema: { type: "string", enum: ["1h", "24h", "7d", "30d", "90d"], default: "24h" } }, { name: "bucket", in: "query", schema: { type: "string", enum: ["5m", "1h"], default: "5m" } }],
        responses: { 200: { description: "{range, bucket, uptimePercent, series[{t,count,okCount,p50,p95,p99,min,max,uptime}]}" }, 401: UNAUTH, 404: NF, 422: VAL },
      },
    },
    "/api/monitors/{id}/uptime-daily": {
      get: {
        tags: ["Metrics"], summary: "90-day uptime bar data", security: [{ sessionCookie: [] }, { bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/MonitorId" }, { name: "days", in: "query", schema: { type: "integer", minimum: 1, maximum: 366, default: 90 } }],
        responses: { 200: { description: "{days, series[{day, uptime|null, count}]} — uptime null means no data that day" }, 401: UNAUTH, 404: NF, 422: VAL },
      },
    },

    "/api/incidents": { get: { tags: ["Incidents"], summary: "Account-wide incident timeline", security: [{ sessionCookie: [] }, { bearerAuth: [] }], parameters: [{ $ref: "#/components/parameters/PagingLimit" }, { $ref: "#/components/parameters/PagingCursor" }], responses: { 200: { description: "Incidents, newest first" }, 401: UNAUTH } } },
    "/api/monitors/{id}/incidents": { get: { tags: ["Incidents"], summary: "Per-monitor incident timeline", security: [{ sessionCookie: [] }, { bearerAuth: [] }], parameters: [{ $ref: "#/components/parameters/MonitorId" }, { $ref: "#/components/parameters/PagingLimit" }, { $ref: "#/components/parameters/PagingCursor" }], responses: { 200: { description: "Incidents" }, 401: UNAUTH, 404: NF } } },

    "/api/channels": {
      get: { tags: ["Channels"], summary: "List alert channels (tokens masked)", responses: { 200: { description: "Channels" }, 401: UNAUTH } },
      post: {
        tags: ["Channels"], summary: "Add Telegram channel (session only)",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["chatId"], properties: { chatId: { type: "string" }, token: { type: "string", minLength: 10, description: "Omit to use the platform bot token" } } } } } },
        responses: { 201: { description: "Channel created, token encrypted at rest and masked" }, 401: UNAUTH, 422: VAL },
      },
    },
    "/api/channels/{id}/test": { post: { tags: ["Channels"], summary: "Send a test message", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "{delivered: boolean}" }, 401: UNAUTH, 404: NF } } },

    "/api/status-pages": {
      get: { tags: ["Status pages"], summary: "List own status pages", responses: { 200: { description: "Pages" }, 401: UNAUTH } },
      post: {
        tags: ["Status pages"], summary: "Create status page (publishes selected monitors)",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["slug", "title"], properties: { slug: { type: "string", pattern: "^[a-z0-9-]{3,40}$" }, title: { type: "string" }, description: { type: "string" }, monitorIds: { type: "array", items: { type: "string" } } } } } } },
        responses: { 201: { description: "Created" }, 401: UNAUTH, 409: errorResponse("Slug already taken"), 422: VAL },
      },
    },
    "/api/status-pages/{id}": {
      patch: { tags: ["Status pages"], summary: "Update page / monitor selection", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "Updated" }, 401: UNAUTH, 404: NF, 422: VAL } },
      delete: { tags: ["Status pages"], summary: "Delete page", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 204: { description: "Deleted" }, 401: UNAUTH, 404: NF } },
    },
    "/api/status/{slug}": {
      get: {
        tags: ["Status pages"], summary: "Public status payload", security: [],
        description: "Unauthenticated. Only monitors the owner placed on the page are included. Cached in Redis for 60s.",
        parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string", pattern: "^[a-z0-9-]{3,40}$" } }],
        responses: { 200: { description: "{slug,title,description,overall,monitors[{name,status,uptime90d,bars[90]}],activeIncidents[]}" }, 404: NF },
      },
    },

    "/api-keys": {
      get: { tags: ["API keys"], summary: "List own keys (no secrets)", responses: { 200: { description: "Keys with prefix/lastUsedAt" }, 401: UNAUTH } },
      post: {
        tags: ["API keys"], summary: "Create key — secret returned exactly once",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["name"], properties: { name: { type: "string", maxLength: 100 } } } } } },
        responses: { 201: { description: "{key, secret} — store the secret now; only its hash is kept" }, 401: UNAUTH, 422: VAL },
      },
    },
    "/api-keys/{id}": { delete: { tags: ["API keys"], summary: "Revoke key (immediate)", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 204: { description: "Revoked" }, 401: UNAUTH, 404: NF } } },

    "/api/events": {
      get: {
        tags: ["Live"], summary: "SSE stream of check/incident events", security: [{ sessionCookie: [] }],
        description: "Server-sent events: `event: check` {monitorId, ok, statusCode, latencyMs, at}, `event: incident` {action, incidentId, monitorId, at}, heartbeat comments.",
        responses: { 200: { description: "text/event-stream" }, 401: UNAUTH },
      },
    },
  },
} as const;

export const specHandler: UniversalHandler = enhance(
  async () => Response.json(openApiSpec),
  { name: "lunite:openapi-spec", path: "/openapi.json", method: "GET", immutable: false },
);

export const docsHandler: UniversalHandler = enhance(
  async () => {
    // Reference fetches the spec from our own endpoint — doc parity by construction.
    const html = renderApiReference({
      config: { url: "/openapi.json" },
      pageTitle: "Lunite API",
    });
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  },
  { name: "lunite:docs", path: "/docs", method: "GET", immutable: false },
);
