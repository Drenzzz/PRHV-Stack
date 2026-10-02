// Typed fetch client for Lunite app routes (ADR-010: same-origin, no CORS).
// Types are imported from the server modules — always `import type`, so the
// client bundle only gets types, never server code (node:crypto, db, etc).

import type { Monitor, NewMonitor } from "../database/drizzle/queries/monitors";
import type { MonitorListRow, DayCell } from "../database/drizzle/queries/dashboard";
import type { MetricsResult, BucketRow } from "../database/drizzle/queries/checks";
import type { IncidentRow } from "../server/incidents";
import type { PublicChannel } from "../server/channels";
import type { PublicStatusPage } from "../server/status";
import type { ErrorCode } from "../server/http";

export type { Monitor, NewMonitor, MonitorListRow, DayCell, BucketRow, MetricsResult, IncidentRow, PublicChannel, PublicStatusPage, ErrorCode };

// Error shape returned by every app route (04 §3). `/api/auth/*` uses Better
// Auth's native shape and is not routed through here.
export interface ApiError {
  code: ErrorCode;
  message: string;
  fields?: { path: string; reason: string }[];
}

export class ApiRequestError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fields: { path: string; reason: string }[];

  constructor(status: number, error: ApiError) {
    super(error.message);
    this.name = "ApiRequestError";
    this.code = error.code;
    this.status = status;
    this.fields = error.fields ?? [];
  }

  // Field-level message for inline form display.
  fieldError(path: string): string | undefined {
    return this.fields.find((f) => f.path === path)?.reason;
  }
}

// 401 = session gone (stale/expired). Callers redirect to /login keeping the
// intended destination so re-login lands back where the user was.
export class SessionExpiredError extends ApiRequestError {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set("content-type", "application/json");

  const res = await fetch(path, {
    ...init,
    credentials: "include",
    headers,
  });

  if (res.status === 204) return undefined as T;

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = undefined;
  }

  if (!res.ok) {
    const err = (body ?? {}) as Partial<ApiError>;
    const apiErr = {
      code: err.code ?? "INTERNAL",
      message: err.message ?? "Request failed",
      fields: err.fields,
    };
    if (res.status === 401 && apiErr.code === "UNAUTHENTICATED") {
      throw new SessionExpiredError(401, apiErr);
    }
    throw new ApiRequestError(res.status, apiErr);
  }

  return body as T;
}

function json(method: string, data?: unknown): RequestInit {
  return { method, body: data === undefined ? undefined : JSON.stringify(data) };
}

export const api = {
  listMonitors: () => request<{ monitors: MonitorListRow[] }>("/api/monitors"),

  getMonitor: (id: string) => request<{ monitor: Monitor }>(`/api/monitors/${id}`),

  createMonitor: (data: Partial<NewMonitor>) =>
    request<{ monitor: Monitor }>("/api/monitors", json("POST", data)),

  updateMonitor: (id: string, data: Partial<NewMonitor>) =>
    request<{ monitor: Monitor }>(`/api/monitors/${id}`, json("PATCH", data)),

  deleteMonitor: (id: string) => request<void>(`/api/monitors/${id}`, json("DELETE")),

  checkNow: (id: string) => request<void>(`/api/monitors/${id}/check`, json("POST")),

  metrics: (id: string, range: string, bucket: string) =>
    request<MetricsResult>(`/api/monitors/${id}/metrics?range=${range}&bucket=${bucket}`),

  uptimeDaily: (id: string, days = 90) =>
    request<{ days: number; series: DayCell[] }>(`/api/monitors/${id}/uptime-daily?days=${days}`),

  monitorIncidents: (id: string, limit = 50, cursor = 0) =>
    request<{ incidents: IncidentRow[] }>(`/api/monitors/${id}/incidents?limit=${limit}&cursor=${cursor}`),

  allIncidents: (limit = 50, cursor = 0) =>
    request<{ incidents: IncidentRow[] }>(`/api/incidents?limit=${limit}&cursor=${cursor}`),

  listChannels: () => request<{ channels: PublicChannel[] }>("/api/channels"),

  createChannel: (data: { chatId: string; token?: string }) =>
    request<{ channel: PublicChannel }>("/api/channels", json("POST", data)),

  testChannel: (id: string) => request<{ delivered: boolean; error?: string }>(`/api/channels/${id}/test`, json("POST")),

  listStatusPages: () => request<{ pages: PublicStatusPage[] }>("/api/status-pages"),

  createStatusPage: (data: { slug: string; title: string; description?: string; monitorIds?: string[] }) =>
    request<{ page: PublicStatusPage }>("/api/status-pages", json("POST", data)),

  updateStatusPage: (id: string, data: { title?: string; description?: string | null; monitorIds?: string[] }) =>
    request<{ page: PublicStatusPage }>(`/api/status-pages/${id}`, json("PATCH", data)),

  deleteStatusPage: (id: string) => request<void>(`/api/status-pages/${id}`, json("DELETE")),
};
