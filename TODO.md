Follow the steps below to finish setting up your application.

## Better Auth

Pages are scaffolded at `/login`, `/signup` and `/account` (the latter is protected and redirects to `/login`).

1. Replace `BETTER_AUTH_SECRET` in your `.env` with a strong, unique value before going to production — see <https://better-auth.com/docs/reference/options#secret>.
2. Create Better Auth's tables — they live in your Drizzle schema (`database/drizzle/schema/auth.ts`), so the Drizzle migrate steps create them.
3. (Optional) Enable GitHub sign-in: create a GitHub OAuth app (<https://github.com/settings/developers>), set the callback URL to `<your-app-url>/api/auth/callback/github`, and fill `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` in your `.env`. The button is hidden until both are set.

See <https://better-auth.com/docs> for adding more providers and plugins.

## Drizzle

First, ensure that `DATABASE_URL` is configured in `.env` file, then create the database:

```bash
bun run drizzle:generate # a script that executes drizzle-kit generate.
bun run drizzle:migrate # a script that executes drizzle-kit migrate.
```

> \[!NOTE]
> The `drizzle-kit generate` command is used to generate SQL migration files based on your Drizzle schema.
>
> The `drizzle-kit migrate` command is used to apply the generated migrations to your database.

Read more on [Drizzle ORM documentation](https://orm.drizzle.team/docs/overview)

