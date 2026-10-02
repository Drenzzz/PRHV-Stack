import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { monitors } from "./monitors";

// Raw probe results. `checks` is partitioned monthly by checked_at via hand-written
// SQL migration (drizzle-kit generate does not emit PARTITION BY — 03 §4, REQ-041).
// PK must include the partition key: (checked_at, monitor_id).
export const checks = pgTable(
  "checks",
  {
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
    monitorId: text("monitor_id")
      .notNull()
      .references(() => monitors.id),
    region: text("region").notNull(),
    ok: boolean("ok").notNull(),
    statusCode: integer("status_code"),
    ttfbMs: integer("ttfb_ms"),
    latencyMs: integer("latency_ms"),
    // ok=false requires error detail (03 §6); ok probes may carry null error.
    error: text("error"),
  },
  (t) => [index("checks_monitor_checked_idx").on(t.monitorId, t.checkedAt)],
);

// Pre-aggregated 5m/1h buckets; idempotent upsert target (REQ-015, ADR-004).
export const checkRollups = pgTable(
  "check_rollups",
  {
    monitorId: text("monitor_id")
      .notNull()
      .references(() => monitors.id),
    bucketStart: timestamp("bucket_start", { withTimezone: true }).notNull(),
    bucketSizeSec: integer("bucket_size_sec").notNull(),
    count: integer("count").notNull(),
    okCount: integer("ok_count").notNull(),
    p50Ms: integer("p50_ms"),
    p95Ms: integer("p95_ms"),
    p99Ms: integer("p99_ms"),
    minMs: integer("min_ms"),
    maxMs: integer("max_ms"),
  },
  (t) => [
    uniqueIndex("check_rollups_bucket_unique").on(t.monitorId, t.bucketStart, t.bucketSizeSec),
    index("check_rollups_monitor_start_idx").on(t.monitorId, t.bucketStart),
  ],
);

// Down periods: open → resolved. ≤1 open incident per monitor via partial
// unique index (hand-written SQL migration, 03 §4).
export const incidents = pgTable(
  "incidents",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    monitorId: text("monitor_id")
      .notNull()
      .references(() => monitors.id),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    status: text("status", { enum: ["open", "resolved"] }).notNull().default("open"),
    reason: text("reason").notNull(),
  },
  (t) => [index("incidents_monitor_started_idx").on(t.monitorId, t.startedAt.desc())],
);

// Telegram config; token encrypted at rest via APP_ENCRYPTION_KEY (05 §7).
export const alertChannels = pgTable(
  "alert_channels",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    type: text("type", { enum: ["telegram"] }).notNull().default("telegram"),
    // NULL → worker falls back to TELEGRAM_BOT_TOKEN platform bot (04 §4).
    tokenEncrypted: text("token_encrypted"),
    chatId: text("chat_id").notNull(),
    verified: boolean("verified").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("alert_channels_user_id_idx").on(t.userId)],
);

// Per-monitor debounce thresholds + channel link (1 rule/monitor MVP, 03 §4).
export const alertRules = pgTable(
  "alert_rules",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    monitorId: text("monitor_id")
      .notNull()
      .references(() => monitors.id),
    channelId: text("channel_id")
      .notNull()
      .references(() => alertChannels.id),
    failureThreshold: integer("failure_threshold").notNull().default(3),
    recoveryThreshold: integer("recovery_threshold").notNull().default(2),
    enabled: boolean("enabled").notNull().default(true),
  },
  (t) => [uniqueIndex("alert_rules_monitor_unique").on(t.monitorId)],
);

// Hashed bearer keys; secret returned once at creation (REQ-025). Read-only surface.
export const apiKeys = pgTable(
  "api_keys",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    name: text("name").notNull(),
    prefix: text("prefix").notNull(),
    keyHash: text("key_hash").notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("api_keys_key_hash_unique").on(t.keyHash),
    index("api_keys_user_id_idx").on(t.userId),
  ],
);

// Public read-only status pages; slug globally unique (REQ-022).
export const statusPages = pgTable(
  "status_pages",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("status_pages_slug_unique").on(t.slug),
    index("status_pages_user_id_idx").on(t.userId),
  ],
);

// Ordered monitors on a status page (REQ-023). Composite PK (status_page_id, monitor_id)
// comes from the hand-written SQL migration (03 §4).
export const statusPageMonitors = pgTable(
  "status_page_monitors",
  {
    statusPageId: text("status_page_id")
      .notNull()
      .references(() => statusPages.id),
    monitorId: text("monitor_id")
      .notNull()
      .references(() => monitors.id),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("status_page_monitors_page_idx").on(t.statusPageId)],
);
