// Uniform error taxonomy for all Lunite app routes (04 §3, REQ-032/FIND-002).
// `/api/auth/*` keeps Better Auth's native shape; everything else uses these helpers.

export type ErrorCode =
  | "VALIDATION"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "TARGET_BLOCKED"
  | "INTERNAL";

export function apiError(code: ErrorCode, status: number, message: string): Response {
  return Response.json({ code, message }, { status });
}

export const unauthorized = () => apiError("UNAUTHENTICATED", 401, "Authentication required");
export const validation = (message: string, fields?: { path: string; reason: string }[]) =>
  Response.json({ code: "VALIDATION", message, fields }, { status: 422 });
// Not found is indistinguishable from not-owned by design (no existence oracle).
export const notFound = () => apiError("NOT_FOUND", 404, "Resource not found");
export const conflict = (message: string) => apiError("CONFLICT", 409, message);
export const targetBlocked = () =>
  apiError("TARGET_BLOCKED", 422, "Probe target resolves to a private or link-local address");
export const internal = (message = "Internal server error") => apiError("INTERNAL", 500, message);
