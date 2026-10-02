import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "node:crypto";

// Token encryption at rest (05 §7): AES-256-GCM keyed from APP_ENCRYPTION_KEY.
// Key derivation: SHA-256 of the hex env value → stable 32-byte key.

function encryptionKey(): Buffer {
  const secret = process.env.APP_ENCRYPTION_KEY;
  if (!secret) throw new Error("Missing APP_ENCRYPTION_KEY in .env file");
  return createHash("sha256").update(secret).digest();
}

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptToken(encrypted: string): string {
  const [ivB64, tagB64, dataB64] = encrypted.split(":");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("invalid encrypted token format");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

// API key secret handling (REQ-025): SHA-256 hash + short display prefix.
export function hashApiKey(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function apiKeyPrefix(secret: string): string {
  return `lun_${secret.slice(0, 8)}`;
}

export function generateApiKeySecret(): string {
  return randomBytes(24).toString("base64url");
}
