import tls from "node:tls";

// SSL certificate expiry (REQ-028): one TLS handshake, read valid_to. Uses the
// built-in tls module — no dependency. Best-effort: any failure returns null
// and never disturbs the probe loop.

const TLS_TIMEOUT_MS = 8000;

export function daysUntil(expiresAt: Date, now: Date = new Date()): number {
  return Math.floor((expiresAt.getTime() - now.getTime()) / 86400000);
}

// Alert threshold: 14 days (OQ-004 resolved default, REQ-028).
export const SSL_ALERT_DAYS = 14;

export function shouldAlertSsl(expiresAt: Date, now: Date = new Date()): boolean {
  return daysUntil(expiresAt, now) <= SSL_ALERT_DAYS;
}

export function getCertificateExpiry(url: string): Promise<Date | null> {
  return new Promise((resolve) => {
    let hostname: string;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:") return resolve(null);
      hostname = parsed.hostname;
    } catch {
      return resolve(null);
    }

    const socket = tls.connect({
      host: hostname,
      port: 443,
      servername: hostname,
      // Expiry is the fact we read; chain validity is out of scope for MVP.
      rejectUnauthorized: false,
      timeout: TLS_TIMEOUT_MS,
    });

    const done = (value: Date | null) => {
      socket.destroy();
      resolve(value);
    };

    socket.once("secureConnect", () => {
      try {
        const cert = socket.getPeerCertificate();
        const validTo = cert?.valid_to;
        done(validTo ? new Date(validTo) : null);
      } catch {
        done(null);
      }
    });
    socket.once("error", () => done(null));
    socket.once("timeout", () => done(null));
  });
}
