import { redirect } from "vike/abort";
import type { PageContext } from "vike/types";

// Already logged in? Skip the form.
export function guard(pageContext: PageContext) {
  if (pageContext.user) {
    throw redirect("/dashboard");
  }
}
