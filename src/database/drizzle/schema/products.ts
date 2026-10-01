import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Prices are stored as integer minor units (e.g. cents) to avoid float math.
export const product = pgTable("product", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  price: integer("price").notNull(),
  stock: integer("stock").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});
