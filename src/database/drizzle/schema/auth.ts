import { boolean, pgTable, text as pgText, timestamp, uniqueIndex as pgUniqueIndex } from "drizzle-orm/pg-core";

// Better Auth's tables, owned by Drizzle so its migrations create them.
// Regenerate with `npx auth generate` if you customize the Better Auth config.
// Column names are snake_case to match Better Auth's Drizzle adapter defaults.

export const user = pgTable("user", {
  id: pgText("id").primaryKey(),
  name: pgText("name").notNull(),
  email: pgText("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull(),
  image: pgText("image"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const session = pgTable("session", {
  id: pgText("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: pgText("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: pgText("ip_address"),
  userAgent: pgText("user_agent"),
  userId: pgText("user_id").notNull(),
});

// Since Better Auth 1.7 account identity is scoped by `issuer`: the column exists and
// (issuer, accountId) should be unique. Nullable because newer 1.7.x releases no longer
// write it on credential accounts; inserts would fail on a NOT NULL column.
// https://better-auth.com/docs/guides/1-7-upgrade-guide
export const account = pgTable(
  "account",
  {
    id: pgText("id").primaryKey(),
    accountId: pgText("account_id").notNull(),
    providerId: pgText("provider_id").notNull(),
    issuer: pgText("issuer"),
    userId: pgText("user_id").notNull(),
    accessToken: pgText("access_token"),
    refreshToken: pgText("refresh_token"),
    idToken: pgText("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: pgText("scope"),
    password: pgText("password"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [pgUniqueIndex("account_issuer_accountId_uidx").on(table.issuer, table.accountId)],
);

export const verification = pgTable("verification", {
  id: pgText("id").primaryKey(),
  identifier: pgText("identifier").notNull(),
  value: pgText("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});
