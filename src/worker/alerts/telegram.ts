import { sql } from "drizzle-orm";
import { dbPostgres } from "../../database/drizzle/db";
import { decryptToken } from "../../lib/crypto";
import { sendTelegram } from "../../server/channels";

const db = dbPostgres();

// Incident notifications (REQ-021, CF-002 default): one dispatch per transition
// with bounded retry (≤3, exponential backoff). Delivery is best-effort — a
// timeout after Telegram accepted the message can duplicate; that is documented
// rather than guaranteed-away.

const RETRY_MAX = 3;

export async function notifyIncident(
  channelId: string,
  message: string,
): Promise<boolean> {
  const rows = (await db.execute(sql`
    SELECT token_encrypted, chat_id FROM alert_channels WHERE id = ${channelId}
  `)) as unknown as Array<{ token_encrypted: string | null; chat_id: string }>;
  if (rows.length === 0) return false;

  const channel = rows[0];
  const token = channel.token_encrypted
    ? decryptToken(channel.token_encrypted)
    : process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error(`[notifier] channel ${channelId}: no token configured, alert dropped`);
    return false;
  }

  for (let attempt = 1; attempt <= RETRY_MAX; attempt++) {
    const ok = await sendTelegram(token, channel.chat_id, message);
    if (ok) return true;
    if (attempt < RETRY_MAX) {
      await Bun.sleep(500 * 2 ** (attempt - 1)); // 500ms, 1s
    }
  }

  console.error(`[notifier] channel ${channelId}: delivered:false after ${RETRY_MAX} attempts`);
  return false;
}

export function incidentMessage(monitorName: string, url: string, error: string | null, since: Date): string {
  return `🔴 DOWN — ${monitorName}\n${url}\n${error ?? "unreachable"}\nSince ${since.toISOString()}`;
}

export function recoveryMessage(monitorName: string, url: string, downSince: Date): string {
  const seconds = Math.round((Date.now() - downSince.getTime()) / 1000);
  const duration = seconds >= 60 ? `${Math.round(seconds / 60)} m` : `${seconds} s`;
  return `🟢 RECOVERED — ${monitorName}\n${url}\nDown for ${duration}`;
}
