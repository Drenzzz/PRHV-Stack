import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";
import {
  buildPublicStatus,
  getStatusPageBySlug,
  SLUG_RE,
} from "../../../database/drizzle/queries/status";

// Server-only data load for the public status page (REQ-022). Unknown slug →
// 404 with no hint about other slugs (no existence oracle).
export async function onBeforeRender(pageContext: PageContextServer) {
  const slug = pageContext.routeParams?.slug ?? "";
  if (!SLUG_RE.test(slug)) throw render(404, "This status page doesn't exist (or was unpublished).");

  const page = await getStatusPageBySlug(slug);
  if (!page) throw render(404, "This status page doesn't exist (or was unpublished).");

  const data = await buildPublicStatus(page.id);
  if (!data) throw render(404, "This status page doesn't exist (or was unpublished).");

  return {
    pageContext: {
      data,
    },
  };
}
