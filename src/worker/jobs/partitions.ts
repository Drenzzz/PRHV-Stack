import { sql } from "drizzle-orm";
import { dbPostgres } from "../../database/drizzle/db";

const db = dbPostgres();

// Partition pre-creation (REQ-041): guarantee past/current/future monthly
// partitions of `checks` exist, so inserts never fail with "no partition".
export async function ensurePartitions(aheadMonths = 2, now: Date = new Date()): Promise<string[]> {
  const created: string[] = [];

  for (let i = -1; i <= aheadMonths; i++) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i + 1, 1));
    const name = `checks_y${start.getUTCFullYear()}_m${String(start.getUTCMonth() + 1).padStart(2, "0")}`;

    // Idempotent: CREATE TABLE IF NOT EXISTS. Bounds inlined as literals —
    // parameterized values can't be typed in PARTITION OF ... FOR VALUES.
    const startIso = start.toISOString();
    const endIso = end.toISOString();
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS ${sql.identifier(name)} PARTITION OF checks
      FOR VALUES FROM (${sql.raw(`'${startIso}'`)}) TO (${sql.raw(`'${endIso}'`)})
    `);
    created.push(name);
  }

  return created;
}
