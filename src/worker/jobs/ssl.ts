import { sql } from "drizzle-orm";
import { dbPostgres } from "../../database/drizzle/db";
import { getCertificateExpiry, shouldAlertSsl } from "../prober/ssl";
import type { ClaimedMonitor } from "../scheduler";

const db = dbPostgres();

export interface SslRefreshResult {
  expiresAt: string | null;
  // True only on the transition INTO the ≤14-day window (or when the date
  // itself changes) — repeated probes must never re-send the alert (REQ-028).
  shouldAlert: boolean;
}

// Refresh ssl_expires_at for a monitor with ssl_check enabled (REQ-028).
// Best-effort: failures leave the previous value untouched.
export async function refreshSslExpiry(monitor: ClaimedMonitor): Promise<SslRefreshResult | null> {
  if (!monitor.sslCheck || !monitor.url.startsWith("https://")) return null;

  const expiry = await getCertificateExpiry(monitor.url);
  if (!expiry || Number.isNaN(expiry.getTime())) return null;

  const expiryIso = expiry.toISOString();
  const previous = monitor.sslExpiresAt;
  const dateChanged = previous === null || previous !== expiryIso;

  await db.execute(sql`
    UPDATE monitors SET ssl_expires_at = ${expiryIso} WHERE id = ${monitor.id}
  `);

  return {
    expiresAt: expiryIso,
    shouldAlert: dateChanged && shouldAlertSsl(expiry),
  };
}
