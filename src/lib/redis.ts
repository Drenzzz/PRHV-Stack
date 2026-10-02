import Redis from "ioredis";
import "../server/load";

// Redis singleton (ADR-008): pub/sub events, rate limiting (M4), status-page cache (M4).
// M1 uses it for worker → server event fan-out. Loss is acceptable —
// data of record is Postgres; Redis holds only ephemeral state.

let publisher: Redis | null = null;
let subscriber: Redis | null = null;

export function redisPublisher(): Redis {
  if (!process.env.REDIS_URL) throw new Error("Missing REDIS_URL in .env file");
  publisher ??= new Redis(process.env.REDIS_URL, { lazyConnect: false, maxRetriesPerRequest: 1 });
  return publisher;
}

export function redisSubscriber(): Redis {
  if (!process.env.REDIS_URL) throw new Error("Missing REDIS_URL in .env file");
  // Subscribers need a dedicated connection (subscribed mode can't issue commands).
  subscriber ??= new Redis(process.env.REDIS_URL, { lazyConnect: false, maxRetriesPerRequest: 1 });
  return subscriber;
}
