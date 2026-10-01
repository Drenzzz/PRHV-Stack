import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export function dbPostgres() {
  if (!process.env.DATABASE_URL) {
    throw new Error("Missing DATABASE_URL in .env file");
  }
  return drizzlePostgres(postgres(process.env.DATABASE_URL));
}
