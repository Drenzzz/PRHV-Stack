// SSRF guard (REQ-034, RISK-006): reject probe targets resolving to private,
// link-local, loopback, or cloud-metadata addresses unless explicitly opted out
// via ALLOW_PRIVATE_PROBE_TARGETS=true.

import { lookup } from "node:dns/promises";
import net from "node:net";

export interface IpCheckResult {
  allowed: boolean;
  reason?: string;
}

function isPrivateV4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  const [a, b] = parts;
  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a === 127 ||
    a === 0 ||
    a === 169 && b === 254 || // link-local incl. cloud metadata 169.254.169.254
    a === 100 && b >= 64 && b <= 127 || // CGNAT
    a >= 224 // multicast + reserved
  );
}

function isPrivateV6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fe80")) return true; // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
  if (lower.startsWith("::ffff:")) return isPrivateV4(lower.slice(7)); // v4-mapped
  return false;
}

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateV4(ip);
  if (net.isIPv6(ip)) return isPrivateV6(ip);
  return true; // unparseable → treat as private (fail closed)
}

export function allowPrivateTargets(): boolean {
  return process.env.ALLOW_PRIVATE_PROBE_TARGETS === "true";
}

// Resolve the hostname and check every resolved address (fail closed on error).
export async function assertProbeTargetAllowed(rawUrl: string): Promise<IpCheckResult> {
  if (allowPrivateTargets()) return { allowed: true };

  let hostname: string;
  try {
    hostname = new URL(rawUrl).hostname;
  } catch {
    return { allowed: false, reason: "invalid URL" };
  }

  if (net.isIP(hostname)) {
    return isPrivateIp(hostname)
      ? { allowed: false, reason: `target IP ${hostname} is private/link-local` }
      : { allowed: true };
  }

  try {
    const addresses = await lookup(hostname, { all: true });
    if (addresses.length === 0) {
      return { allowed: false, reason: "target did not resolve" };
    }
    const privateHit = addresses.find((a) => isPrivateIp(a.address));
    if (privateHit) {
      return { allowed: false, reason: `target resolves to private/link-local address ${privateHit.address}` };
    }
    return { allowed: true };
  } catch {
    return { allowed: false, reason: "target DNS lookup failed" };
  }
}
