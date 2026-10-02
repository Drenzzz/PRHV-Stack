import type { Config } from "vike/types";

// Public status page: server-rendered for SEO/OG (ADR-005, REQ-022).
// title/description null: the page renders its own dynamic tags via <Head>,
// otherwise the global config title would be emitted first and win.
const config: Config = {
  ssr: true,
  passToClient: ["data"],
  title: null,
  description: null,
};

export default config;
