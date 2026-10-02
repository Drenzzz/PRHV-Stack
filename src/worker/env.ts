import "../server/load";

export function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
}

export function workerEnv() {
  return {
    databaseUrl: requireEnv("DATABASE_URL"),
    redisUrl: requireEnv("REDIS_URL"),
    region: process.env.REGION ?? "id-1",
    allowPrivateProbeTargets: process.env.ALLOW_PRIVATE_PROBE_TARGETS === "true",
  };
}
