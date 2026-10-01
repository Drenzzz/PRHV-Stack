import {
  enhance,
  type RuntimeAdapter,
  type UniversalHandler,
} from "@universal-middleware/core";
import { z } from "zod";
import { getAuth } from "./better-auth-handler";
import * as productQueries from "../database/drizzle/queries/products";

// Template CRUD pattern: session-checked JSON API under /api/*.
// Hono port of the Elysia `productRoutes`: same routes, same status codes,
// validation via zod instead of Elysia's `t`.

const createSchema = z.object({
  name: z.string().min(1),
  price: z.number().int().min(0),
  stock: z.number().int().min(0),
});

const updateSchema = createSchema.partial();

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

async function requireUserId(request: Request, runtime: RuntimeAdapter): Promise<string | null> {
  const session = await getAuth(runtime).api.getSession({ headers: request.headers });
  return session?.user?.id ?? null;
}

function productId(request: Request): string {
  // Matches path "/api/products/:id".
  return new URL(request.url).pathname.split("/").pop() ?? "";
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export const listProductsHandler: UniversalHandler = enhance(
  async (request, _context, runtime) => {
    if (!(await requireUserId(request, runtime))) return unauthorized();
    return Response.json(await productQueries.listProducts());
  },
  { name: "prhv:list-products", path: "/api/products", method: "GET", immutable: false },
);

export const createProductHandler: UniversalHandler = enhance(
  async (request, _context, runtime) => {
    if (!(await requireUserId(request, runtime))) return unauthorized();
    const parsed = createSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return Response.json({ error: "Invalid body" }, { status: 422 });
    }
    const created = await productQueries.createProduct(parsed.data);
    return Response.json(created, { status: 201 });
  },
  { name: "prhv:create-product", path: "/api/products", method: "POST", immutable: false },
);

export const updateProductHandler: UniversalHandler = enhance(
  async (request, _context, runtime) => {
    if (!(await requireUserId(request, runtime))) return unauthorized();
    const parsed = updateSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return Response.json({ error: "Invalid body" }, { status: 422 });
    }
    const updated = await productQueries.updateProduct(productId(request), parsed.data);
    if (!updated) return new Response("Not found", { status: 404 });
    return Response.json(updated);
  },
  { name: "prhv:update-product", path: "/api/products/:id", method: "PATCH", immutable: false },
);

export const deleteProductHandler: UniversalHandler = enhance(
  async (request, _context, runtime) => {
    if (!(await requireUserId(request, runtime))) return unauthorized();
    await productQueries.deleteProduct(productId(request));
    return new Response(null, { status: 204 });
  },
  { name: "prhv:delete-product", path: "/api/products/:id", method: "DELETE", immutable: false },
);
