import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

// Probe configuration + scheduling/debounce state (03 §4, ADR-003).
export const monitors = pgTable(
  "monitors",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    name: text("name").notNull(),
    url: text("url").notNull(),
    // PUT/PATCH/DELETE probing intentionally unsupported in MVP (03 §4).
    method: text("method", { enum: ["GET", "HEAD", "POST"] }).notNull().default("GET"),
    intervalSec: integer("interval_sec").notNull().default(60),
    timeoutMs: integer("timeout_ms").notNull().default(10000),
    expectedStatus: integer("expected_status"),
    expectedKeywords: jsonb("expected_keywords").notNull().default([]),
    active: boolean("active").notNull().default(true),
    // next_check_at IS NULL iff active=false (enforced by app logic, 03 §6).
    nextCheckAt: timestamp("next_check_at", { withTimezone: true }),
    currentStatus: text("current_status", { enum: ["unknown", "up", "down", "paused"] })
      .notNull()
      .default("unknown"),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    consecutiveSuccesses: integer("consecutive_successes").notNull().default(0),
    openIncidentId: text("open_incident_id"),
    sslCheck: boolean("ssl_check").notNull().default(false),
    sslExpiresAt: timestamp("ssl_expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index("monitors_user_id_idx").on(t.userId),
    // Partial index keeps the worker's claim scan O(due) (03 §7).
    index("monitors_next_check_at_idx").on(t.nextCheckAt),
  ],
);
