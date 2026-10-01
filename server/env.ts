import "./load.js";

export const env: Record<string, string | undefined> = typeof process?.env !== "undefined" ? process.env : {};
