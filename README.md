# PRHV Stack

**P**ostgres · **R**eact · **H**ono · **V**ike, with Drizzle, Better Auth and shadcn/ui.

A web app starter: landing page, email authentication, a protected dashboard, a working CRUD example, and a Docker setup.

## What's included

- Landing page at `/`, login and signup at `/login` and `/signup`, both with email + password via Better Auth, session cookies, and server-side route guards.
- Dashboard at `/dashboard` with a collapsible sidebar, stat cards, an interactive chart, and a data table (shadcn/ui blocks).
- Live CRUD example at `/dashboard/products`, with a Postgres-backed table, a dialog form, toast feedback, and seed data. This is the pattern to copy for every new entity.
- PostgreSQL + Drizzle, versioned migrations, type-safe queries.
- Docker setup (multi-stage image + Compose, app + Postgres, migrations applied automatically on start).
- React Compiler on, automatic memoization, no manual `useMemo`.
- `oxlint` (type-aware) and `tsc --noEmit` both run clean.

## Quickstart

Requirements: [Bun](https://bun.sh), PostgreSQL 17+ (or Docker).

```sh
cp .env.example .env   # fill in DATABASE_URL + BETTER_AUTH_SECRET (generate: bunx @better-auth/cli secret)
bun install
bun run drizzle:migrate
bun run db:seed        # optional example products
bun run dev            # → http://localhost:3000
```

### Docker (alternative)

```sh
docker compose up --build   # → http://localhost:3000 (migrations applied automatically)
```

## Scripts

| Command | Description |
|---|---|
| `bun run dev` | Vike dev server (default port 3000) |
| `bun run build` / `bun run prod` | Production build / run built server |
| `bun run lint` | oxlint (type-aware, must be 0 errors) |
| `bunx tsc --noEmit` | Typecheck |
| `bun run drizzle:generate` | Generate migration from schema changes |
| `bun run drizzle:migrate` | Apply pending migrations |
| `bun run drizzle:studio` | Drizzle Studio DB browser |
| `bun run db:seed` | Seed example products (idempotent) |

## Project Structure

```
src/
├── pages/            # Filesystem routing, folder name = URL
│   ├── index/        # /            landing page
│   ├── login/        # /login       (+guard.ts redirects to /dashboard when logged in)
│   ├── signup/       # /signup      (idem)
│   ├── dashboard/    # /dashboard   (+Layout sidebar shell, +guard.ts auth guard)
│   │   └── products/ # /dashboard/products  live CRUD example
│   ├── _error/       # 404 / 500 page
│   └── +Layout.tsx   # Minimal root layout (pages bring their own shell)
├── components/
│   ├── ui/           # shadcn/ui primitives (button, card, table, sidebar, chart, dialog, …)
│   └── app-sidebar.tsx, data-table.tsx, login-form.tsx, …  # blocks + wired forms
├── server/
│   ├── better-auth.ts  # Better Auth config (email+password, Drizzle adapter, trustedOrigins)
│   ├── better-auth-handler.ts  # Session middleware (sets pageContext.user) + /api/auth/* route
│   ├── hono.ts       # App wiring: middlewares + API handlers + Vike
│   ├── products.ts   # Template CRUD handlers (session check + zod validation)
│   ├── env.ts        # Typed process.env access
│   └── db-middleware.ts / load.ts  # pageContext.db + .env loading
├── database/drizzle/
│   ├── schema/       # auth.ts (Better Auth tables) and products.ts
│   ├── queries/      # Type-safe query functions per entity
│   └── migrations/   # Versioned SQL (never edit applied files)
├── lib/              # auth-client.ts (useSession/signIn/signUp/signOut) · form.ts · utils.ts
└── +server.ts        # Server entry (PORT env, default 3000)
```

## Routes

| URL | Access | Description |
|---|---|---|
| `/` | public | Landing page |
| `/login`, `/signup` | public (bounce when logged in) | Auth forms with inline errors |
| `/dashboard` | login required | Sidebar + stat cards + chart + sample data table |
| `/dashboard/products` | login required | Live product CRUD backed by Postgres |
| `/api/auth/*` | n/a | Better Auth endpoints (sign-up/in/out, session) |
| `/api/products*` | login required | Product CRUD API (401 anonymous, 422 invalid body) |

## Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `BETTER_AUTH_SECRET` | Auth signing secret (`bunx @better-auth/cli secret`) |
| `BETTER_AUTH_URL` | Canonical app URL (default `http://localhost:3000`) |
| `TRUSTED_ORIGINS` | Comma-separated extra origins allowed to call the auth API (e.g. dev on another port) |
| `PORT` | Server port (default 3000) |
| `POSTGRES_PASSWORD` / `POSTGRES_DB` | Used by `docker-compose.yml` for the `db` service |
| `PUBLIC_ENV__GOOGLE_ANALYTICS` | Optional GA measurement ID (client-exposed) |

## Adding a New CRUD Entity (the pattern)

Copy the `products` flow. Five steps, no new concepts:

1. **Schema**: add `src/database/drizzle/schema/<entity>.ts`. See `products.ts` for the convention (text PK via `crypto.randomUUID()`, integer minor units for money).
2. **Migrate**: `bun run drizzle:generate && bun run drizzle:migrate`.
3. **Queries**: add `src/database/drizzle/queries/<entity>.ts` with list/create/update/delete functions on a module-level `db` singleton.
4. **API**: add handlers in `src/server/products.ts` following the existing four. Use `requireUserId` for the 401 session check and zod schemas for the 422 validation, then register them in the `vike(app, [...])` list in `src/server/hono.ts`.
5. **Page**: add `src/pages/dashboard/<entity>/+Page.tsx` following `products/+Page.tsx`: fetch the list, `Dialog` form, `toast` feedback. The auth guard is inherited from `dashboard/+guard.ts`.

## Adding shadcn/ui Components

```sh
bunx shadcn@latest add <component>   # e.g. dialog, alert-dialog, calendar
```

Aliases (`@/*` → `src/*`) are configured in `tsconfig.json`, `vite.config.ts`, and `components.json`, so registry imports work unchanged. Blocks (`dashboard-01`, `login-02`, etc.) may bring `"use client"` directives, harmless under Vike, leave them.

## Notes & Gotchas

- **Better Auth 1.7** added `account.issuer` (unique with `accountId`). Newer 1.7.x releases no longer write it on credential accounts, so the column is nullable here. If sign-ups fail with a schema mismatch after upgrading `better-auth`, recheck `src/database/drizzle/schema/auth.ts`.
- **API handlers run as universal middleware.** New `UniversalHandler`s go in the `vike(app, [...])` list in `src/server/hono.ts`. Paths support `:id` params via `regexparam`; the handler here parses the id from `request.url` directly.
- **Dev server restarts do not reload `process.env`.** After editing `.env`, kill and restart `bun run dev` instead of relying on Vite auto-restart.
- Money is stored as **integer minor units** (see `product.price`) to avoid float rounding.
- `dist/`, `node_modules/`, and `.env` are gitignored. Migrations are committed. Never edit an applied migration, always generate a new one.

## Tech Stack

Vike · React 19 · Hono · PostgreSQL · Drizzle ORM · Better Auth · Tailwind CSS v4 · shadcn/ui · Recharts · TanStack Table · Bun · TypeScript · oxlint
