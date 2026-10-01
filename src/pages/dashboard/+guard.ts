import { redirect } from "vike/abort";
import type { PageContext } from "vike/types";

// Protected route: bounce anonymous visitors to /login.
// `pageContext.user` is populated by `betterAuthSessionMiddleware`.
export function guard(pageContext: PageContext) {
  if (!pageContext.user) {
    throw redirect("/login");
  }
}
