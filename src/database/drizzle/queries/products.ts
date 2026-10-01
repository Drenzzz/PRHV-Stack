import { desc, eq } from "drizzle-orm";
import { dbPostgres } from "../db";
import { product } from "../schema/products";

const db = dbPostgres();

export type Product = typeof product.$inferSelect;
export type NewProduct = typeof product.$inferInsert;

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "product"
  );
}

export async function listProducts(): Promise<Product[]> {
  return db.select().from(product).orderBy(desc(product.createdAt));
}

export async function createProduct(input: {
  name: string;
  price: number;
  stock: number;
}): Promise<Product> {
  const base = slugify(input.name);
  // ponytail: retry loop for slug collisions, enough for a template seed/admin flow
  for (let attempt = 0; ; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${crypto.randomUUID().slice(0, 6)}`;
    const [row] = await db
      .insert(product)
      .values({ ...input, slug })
      .onConflictDoNothing({ target: product.slug })
      .returning();
    if (row) return row;
  }
}

export async function updateProduct(
  id: string,
  input: Partial<Pick<NewProduct, "name" | "price" | "stock">>,
): Promise<Product | undefined> {
  const [row] = await db
    .update(product)
    .set(input)
    .where(eq(product.id, id))
    .returning();
  return row;
}

export async function deleteProduct(id: string): Promise<void> {
  await db.delete(product).where(eq(product.id, id));
}
