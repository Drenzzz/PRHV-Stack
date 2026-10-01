import type { dbPostgres } from "../db";
import { todoTable } from "../schema/todos";

export function insertTodo(db: ReturnType<typeof dbPostgres>, text: string) {
  return db.insert(todoTable).values({ text });
}

export async function getAllTodos(db: ReturnType<typeof dbPostgres>) {
  const query = db.select().from(todoTable);
  return query;
}
