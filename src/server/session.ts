import type { RuntimeAdapter } from "@universal-middleware/core";
import { getAuth } from "./better-auth-handler";

// Single session guard for all Lunite app routes (REQ-004, REQ-032).
// Returns the session user id, or null when unauthenticated.
export async function requireUserId(request: Request, runtime: RuntimeAdapter): Promise<string | null> {
  const session = await getAuth(runtime).api.getSession({ headers: request.headers });
  return session?.user?.id ?? null;
}
