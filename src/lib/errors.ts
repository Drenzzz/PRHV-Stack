import { toast } from "sonner";
import { ApiRequestError, SessionExpiredError, type ErrorCode } from "./api";

// Render the API error taxonomy (04 §3) as a toast — one place, so every page
// reports failures the same way (REQ-029).

const HEADING: Record<ErrorCode, string> = {
  VALIDATION: "Check your input",
  UNAUTHENTICATED: "Sign in required",
  FORBIDDEN: "Not allowed",
  NOT_FOUND: "Not found",
  CONFLICT: "Already taken",
  RATE_LIMITED: "Too many requests",
  TARGET_BLOCKED: "Target blocked",
  INTERNAL: "Something went wrong",
};

// Toast-friendly message, or null for errors the caller handles itself.
export function showApiError(err: unknown): void {
  if (err instanceof SessionExpiredError) return; // caller redirects to /login
  if (err instanceof ApiRequestError) {
    // Validation is usually rendered inline on fields, not as a toast.
    if (err.code === "VALIDATION") return;
    toast.error(HEADING[err.code], { description: err.message });
    return;
  }
  toast.error(HEADING.INTERNAL, { description: "Check your connection and try again." });
}

// Where to return to after a re-login (06 §4 "Auth expired").
export function redirectToLogin(): void {
  const here = `${window.location.pathname}${window.location.search}`;
  const target = here.startsWith("/login") ? "/dashboard" : `/login?next=${encodeURIComponent(here)}`;
  window.location.href = target;
}

// Returns true when the caller should stop — used after catching an error.
export function isSessionExpired(err: unknown): err is SessionExpiredError {
  return err instanceof SessionExpiredError;
}
