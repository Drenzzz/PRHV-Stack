import { and, count, desc, eq, sql } from "drizzle-orm";
import { dbPostgres } from "../db";
import { monitors } from "../schema/monitors";

const db = dbPostgres();

export type Monitor = typeof monitors.$inferSelect;
export type NewMonitor = typeof monitors.$inferInsert;

// Every function is user-scoped by requirement (REQ-006, REQ-032 / FIND-001).
// Never add an unscoped variant — ownership is the row-level boundary.

export async function listMonitors(userId: string): Promise<Monitor[]> {
  return db
    .select()
    .from(monitors)
    .where(eq(monitors.userId, userId))
    .orderBy(desc(monitors.createdAt));
}

export async function getMonitor(userId: string, id: string): Promise<Monitor | undefined> {
  const [row] = await db
    .select()
    .from(monitors)
    .where(and(eq(monitors.id, id), eq(monitors.userId, userId)));
  return row;
}

export async function countMonitors(userId: string): Promise<number> {
  const [row] = await db.select({ value: count() }).from(monitors).where(eq(monitors.userId, userId));
  return Number(row?.value ?? 0);
}

export async function createMonitor(input: NewMonitor): Promise<Monitor> {
  const [row] = await db.insert(monitors).values(input).returning();
  return row;
}

export async function updateMonitor(
  userId: string,
  id: string,
  input: Partial<Pick<NewMonitor, "name" | "url" | "method" | "intervalSec" | "timeoutMs" | "expectedStatus" | "expectedKeywords" | "sslCheck" | "active" | "currentStatus" | "nextCheckAt">>,
): Promise<Monitor | undefined> {
  const [row] = await db
    .update(monitors)
    .set(input)
    .where(and(eq(monitors.id, id), eq(monitors.userId, userId)))
    .returning();
  return row;
}

export async function deleteMonitor(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(monitors)
    .where(and(eq(monitors.id, id), eq(monitors.userId, userId)))
    .returning({ id: monitors.id });
  return rows.length > 0;
}

// Worker-only claim path (STEP-M1-03/M1-06): due monitors with SKIP LOCKED.
export async function claimDueMonitors(limit = 20): Promise<Monitor[]> {
  const result = await db.execute(sql`
    UPDATE monitors SET next_check_at = now() + (interval_sec * interval '1 second')
    WHERE id IN (
      SELECT id FROM monitors
      WHERE active AND next_check_at <= now()
      ORDER BY next_check_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *;
  `);
  return result as unknown as Monitor[];
}
