// Bun test preload (bunfig.toml): suites create dozens of accounts in seconds,
// which the real 10/min auth limit would block. Consumers are still unit-tested
// directly in rate-limit.test.ts with the default (enabled) path.
process.env.RATE_LIMIT_DISABLED = "true";
