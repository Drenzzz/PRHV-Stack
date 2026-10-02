import { Config } from "vike/types";

// Dashboard is auth-gated and live-update heavy → SPA mode (ADR-005).
// The public status page flips this to ssr:true in M4.
const config: Config = {
  ssr: false,
};

export default config;
