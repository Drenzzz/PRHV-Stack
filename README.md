# Lunite — API uptime & latency monitoring

Lunite is an API uptime & latency monitoring platform built on the PRHV stack: Postgres · React · Hono · Vike, with Drizzle, Better Auth and shadcn/ui.

> Planning docs live in `../Lunite-hono-plan/`. This README is a stub — full setup, architecture diagram and decisions are added in M5 (REQ-042).

## Quickstart

```sh
cp .env.example .env   # fill in DATABASE_URL + BETTER_AUTH_SECRET (generate: bunx @better-auth/cli secret)
bun install
bun run drizzle:migrate
bun run dev
```
