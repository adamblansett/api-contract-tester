import dns from 'node:dns/promises';
import net from 'node:net';
import { SecurityUrlError } from './url.js';

/**
 * Checks if an IPv4 address belongs to a private, loopback, or link-local range.
 */
export function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return false;
  }

  const [p0, p1] = parts;
  if (p0 === undefined || p1 === undefined) {
    return false;
  }

  // Loopback (127.0.0.0/8)
  if (p0 === 127) return true;

  // Unspecified or Broadcast
  if (p0 === 0 || p0 === 255) return true;

  // Link-local / Cloud metadata (169.254.0.0/16)
  if (p0 === 169 && p1 === 254) return true;

  // RFC 1918 Private networks:
  // 10.0.0.0/8
  if (p0 === 10) return true;
  // 172.16.0.0/12 (172.16.0.0 - 172.31.255.255)
  if (p0 === 172 && p1 >= 16 && p1 <= 31) return true;
  // 192.168.0.0/16
  if (p0 === 192 && p1 === 168) return true;

  return false;
}

/**
 * Checks if an IPv6 address belongs to a private, loopback, or link-local range.
 */
export function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();

  // Loopback (::1) or Unspecified (::)
  if (normalized === '::1' || normalized === '::') return true;

  // Link-local (fe80::/10)
  if (
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb')
  ) {
    return true;
  }

  // Unique Local Address (fc00::/7 -> fc00.. or fd00..)
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;

  // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1)
  if (normalized.startsWith('::ffff:')) {
    const ipv4Part = normalized.slice(7);
    if (net.isIPv4(ipv4Part)) {
      return isPrivateIPv4(ipv4Part);
    }
  }

  return false;
}

/**
 * Resolves a hostname or IP and verifies that it does not point to a private,
 * loopback, or cloud-metadata destination when private network blocking is enabled.
 */
export async function assertPublicDestination(urlOrHostname: string): Promise<void> {
  let hostname = urlOrHostname;
  try {
    if (urlOrHostname.includes('://')) {
      const u = new URL(urlOrHostname);
      hostname = u.hostname;
    }
  } catch {
    // Treat as raw hostname
  }

  // If already an IP address
  if (net.isIP(hostname)) {
    if (net.isIPv4(hostname) && isPrivateIPv4(hostname)) {
      throw new SecurityUrlError(
        `Destination IP "${hostname}" is in a private, loopback, or link-local range and is blocked by --block-private-networks.`,
      );
    }
    if (net.isIPv6(hostname) && isPrivateIPv6(hostname)) {
      throw new SecurityUrlError(
        `Destination IPv6 "${hostname}" is in a private, loopback, or link-local range and is blocked by --block-private-networks.`,
      );
    }
    return;
  }

  // Resolve hostname via DNS
  let records: Array<{ address: string; family: number }>;
  try {
    records = await dns.lookup(hostname, { all: true });
  } catch (dnsErr) {
    throw new SecurityUrlError(
      `DNS lookup failed for destination "${hostname}": ${dnsErr instanceof Error ? dnsErr.message : String(dnsErr)}`,
    );
  }

  for (const record of records) {
    if (record.family === 4 && isPrivateIPv4(record.address)) {
      throw new SecurityUrlError(
        `Destination "${hostname}" resolves to private/loopback IP (${record.address}) and is blocked by --block-private-networks.`,
      );
    }
    if (record.family === 6 && isPrivateIPv6(record.address)) {
      throw new SecurityUrlError(
        `Destination "${hostname}" resolves to private/loopback IPv6 (${record.address}) and is blocked by --block-private-networks.`,
      );
    }
  }
}
