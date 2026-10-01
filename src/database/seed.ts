// Seed example products. Idempotent — safe to run multiple times.
// Usage: bun run db:seed
import { dbPostgres } from "./drizzle/db";
import { product } from "./drizzle/schema/products";

const db = dbPostgres();

const seedProducts = [
  { name: "Mechanical Keyboard", slug: "mechanical-keyboard", price: 1290000, stock: 24 },
  { name: "Wireless Mouse", slug: "wireless-mouse", price: 459000, stock: 58 },
  { name: "USB-C Hub", slug: "usb-c-hub", price: 789000, stock: 31 },
  { name: "Monitor Light Bar", slug: "monitor-light-bar", price: 649000, stock: 12 },
  { name: "Laptop Stand", slug: "laptop-stand", price: 329000, stock: 44 },
  { name: "Noise-Cancelling Headphones", slug: "noise-cancelling-headphones", price: 2490000, stock: 9 },
  { name: "Webcam 4K", slug: "webcam-4k", price: 1890000, stock: 17 },
  { name: "Desk Mat XL", slug: "desk-mat-xl", price: 259000, stock: 73 },
  { name: "Ergonomic Chair", slug: "ergonomic-chair", price: 3290000, stock: 6 },
  { name: "Portable SSD 1TB", slug: "portable-ssd-1tb", price: 1590000, stock: 29 },
];

const inserted = await db
  .insert(product)
  .values(seedProducts)
  .onConflictDoNothing({ target: product.slug })
  .returning({ id: product.id });

console.log(`Seeded ${inserted.length} new products (${seedProducts.length - inserted.length} already existed).`);
process.exit(0);
