import { enhance, type UniversalHandler } from "@universal-middleware/core";
import { z } from "zod";
import { notFound, unauthorized, validation } from "./http";
import { requireUserId } from "./session";
import { dbPostgres } from "../database/drizzle/db";
import { sql } from "drizzle-orm";
import { encryptToken, decryptToken } from "../lib/crypto";

const db = dbPostgres();

// Channels API (REQ-031): Telegram config with encrypted token (REQ-033).
// Token is stored encrypted, always masked in responses, never logged.

interface ChannelRow {
  id: string;
  user_id: string;
  type: string;
  token_encrypted: string | null;
  chat_id: string;
  verified: boolean;
  created_at: string;
}

function maskToken(): string {
  return "••••••••";
}

function publicChannel(row: ChannelRow) {
  return {
    id: row.id,
    type: row.type,
    chatId: row.chat_id,
    verified: row.verified,
    hasOwnToken: row.token_encrypted != null,
    token: maskToken(),
    createdAt: row.created_at,
  };
}

const createSchema = z.object({
  token: z.string().min(10).optional(), // optional → falls back to TELEGRAM_BOT_TOKEN
  chatId: z.string().min(1),
});

export const createChannelHandler: UniversalHandler = enhance(
  async (request, _context, runtime) => {
    const userId = await requireUserId(request, runtime);
    if (!userId) return unauthorized();
    const parsed = createSchema.safeParse(await request.json().catch(() => undefined));
    if (!parsed.success) {
      return validation("Invalid body", parsed.error.issues.map((i) => ({ path: i.path.join("."), reason: i.message })));
    }
    const { token, chatId } = parsed.data;
    const tokenEncrypted = token ? encryptToken(token) : null;
    const rows = (await db.execute(sql`
      INSERT INTO alert_channels (id, user_id, type, token_encrypted, chat_id, verified)
      VALUES (gen_random_uuid(), ${userId}, 'telegram', ${tokenEncrypted}, ${chatId}, false)
      RETURNING id, user_id, type, token_encrypted, chat_id, verified, created_at
    `)) as unknown as ChannelRow[];
    return Response.json({ channel: publicChannel(rows[0]) }, { status: 201 });
  },
  { name: "lunite:create-channel", path: "/api/channels", method: "POST", immutable: false },
);

export const listChannelsHandler: UniversalHandler = enhance(
  async (request, _context, runtime) => {
    const userId = await requireUserId(request, runtime);
    if (!userId) return unauthorized();
    const rows = (await db.execute(sql`
      SELECT id, user_id, type, token_encrypted, chat_id, verified, created_at
      FROM alert_channels WHERE user_id = ${userId} ORDER BY created_at DESC
    `)) as unknown as ChannelRow[];
    return Response.json({ channels: rows.map(publicChannel) });
  },
  { name: "lunite:list-channels", path: "/api/channels", method: "GET", immutable: false },
);

// Test send (REQ-031): delivers a probe message; verified=true on success.
export const testChannelHandler: UniversalHandler = enhance(
  async (request, _context, runtime) => {
    const userId = await requireUserId(request, runtime);
    if (!userId) return unauthorized();
    const id = new URL(request.url).pathname.split("/")[3] ?? "";
    const rows = (await db.execute(sql`
      SELECT id, user_id, type, token_encrypted, chat_id, verified, created_at
      FROM alert_channels WHERE id = ${id} AND user_id = ${userId}
    `)) as unknown as ChannelRow[];
    if (rows.length === 0) return notFound();
    const channel = rows[0];

    const token = channel.token_encrypted
      ? decryptToken(channel.token_encrypted)
      : process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      return Response.json({ delivered: false, error: "no token configured" });
    }

    const delivered = await sendTelegram(token, channel.chat_id, "🔔 Lunite test message — alerts for this channel are working.");
    if (delivered) {
      await db.execute(sql`UPDATE alert_channels SET verified = true WHERE id = ${channel.id}`);
    }
    return Response.json({ delivered });
  },
  { name: "lunite:test-channel", path: "/api/channels/:id/test", method: "POST", immutable: false },
);

// Shared sender used by the notifier (M2-06) — one place for the Bot API call.
export async function sendTelegram(token: string, chatId: string, text: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
      signal: AbortSignal.timeout(10000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
