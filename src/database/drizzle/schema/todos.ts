import { pgTable, serial, varchar } from "drizzle-orm/pg-core";

// Example of defining a schema in Drizzle ORM.
export const todoTable = pgTable("todos", {
  id: serial("id").primaryKey(),
  text: varchar("text", { length: 50 }).notNull(),
});

// You can then infer the types for selecting and inserting
export type TodoItem = typeof todoTable.$inferSelect;
export type TodoInsert = typeof todoTable.$inferInsert;
