-- Lunite additions not expressible via drizzle-kit generate (03 §4, REQ-041):
-- 1. checks -> monthly RANGE partitioning (drizzle-kit does not emit PARTITION BY)
-- 2. checks PK must include the partition key
-- 3. partial unique index: ≤1 open incident per monitor

-- Partitioning: recreate as partitioned, attach children, migrate rows.
ALTER TABLE "checks" RENAME TO "checks_flat";

CREATE TABLE "checks" (
	"checked_at" timestamp with time zone NOT NULL,
	"monitor_id" text NOT NULL,
	"region" text NOT NULL,
	"ok" boolean NOT NULL,
	"status_code" integer,
	"ttfb_ms" integer,
	"latency_ms" integer,
	"error" text,
	FOREIGN KEY ("monitor_id") REFERENCES "public"."monitors"("id") ON DELETE no action ON UPDATE no action
) PARTITION BY RANGE ("checked_at");--> statement-breakpoint

-- PK on a partitioned table must include the partition key (03 §4).
ALTER TABLE "checks" ADD CONSTRAINT "checks_pk" PRIMARY KEY ("checked_at","monitor_id");--> statement-breakpoint

CREATE INDEX "checks_monitor_checked_idx" ON "checks" USING btree ("monitor_id","checked_at");--> statement-breakpoint

-- Migrate any dev rows from the flat table (safe no-op on fresh databases).
INSERT INTO "checks" ("checked_at","monitor_id","region","ok","status_code","ttfb_ms","latency_ms","error")
SELECT "checked_at","monitor_id","region","ok","status_code","ttfb_ms","latency_ms","error"
FROM "checks_flat"
WHERE "checked_at" >= date_trunc('month', now()) - interval '1 month'
ON CONFLICT DO NOTHING;--> statement-breakpoint

DROP TABLE "checks_flat";--> statement-breakpoint

-- Initial partitions: previous, current and next month (pre-create job keeps them ahead, REQ-041).
CREATE TABLE IF NOT EXISTS "checks_y2025_m09" PARTITION OF "checks" FOR VALUES FROM ('2025-09-01') TO ('2025-10-01');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "checks_y2026_m10" PARTITION OF "checks" FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "checks_y2026_m11" PARTITION OF "checks" FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');--> statement-breakpoint

-- ≤1 open incident per monitor (03 §4).
CREATE UNIQUE INDEX "incidents_one_open_idx" ON "incidents" ("monitor_id") WHERE "status" = 'open';
