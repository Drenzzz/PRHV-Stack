import type { Config } from "vike/types";
import vikeReact from "vike-react/config";

// Default config (can be overridden by pages)
// https://vike.dev/config

const config: Config = {
  // https://vike.dev/head-tags
  title: "Lunite",
  description: "API uptime & latency monitoring",

  passToClient: ["user"],
  extends: [vikeReact],
};

export default config;
