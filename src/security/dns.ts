import dns from 'node:dns/promises';
import net from 'node:net';
import { SecurityUrlError } from './url.js';

/**
 * Ports designated as restricted/dangerous by the WHATWG Fetch specification
 * to prevent cross-protocol SSRF exploitation (e.g., SMTP smuggling, SMB relay, SSH tunneling).
 */
export const RESTRICTED_PORTS = new Set<number>([
  1, // tcpmux
  7, // echo
  9, // discard
  11, // systat
  13, // daytime
  15, // netstat
  17, // qotd
  19, // chargen
  20, // ftp-data
  21, // ftp
  22, // ssh
  23, // telnet
  25, // smtp
  37, // time
  42, // name
  43, // nicname / whois
  53, // dns
  69, // tftp
  77, // rje
  79, // finger
  87, // ttylink
  95, // supdup
  101, // hostname
  102, // iso-tsap
  103, // gppitnp
  104, // acr-nema
  109, // pop2
  110, // pop3
  111, // sunrpc
  113, // auth / ident
  115, // sftp
  117, // uucp-path
  119, // nntp
  123, // ntp
  135, // epmap
  137, // netbios-ns
  138, // netbios-dgm
  139, // netbios-ssn
  143, // imap
  179, // bgp
  389, // ldap
  445, // microsoft-ds / smb
  465, // smtps
  512, // exec
  513, // login
  514, // shell
  515, // printer
  526, // tempo
  530, // courier
  531, // chat
  532, // netnews
  540, // uucp
  556, // remotefs
  563, // nntps
  587, // submission / smtp
  601, // syslog
  636, // ldaps
  993, // imaps
  995, // pop3s
  2049, // nfs
  3659, // apple-sasl
  4045, // lockd
  6000,
  6001,
  6002,
  6003, // X11
  6665,
  6666,
  6667,
  6668,
  6669, // IRC
]);

export function isRestrictedPort(port: number): boolean {
  return RESTRICTED_PORTS.has(port);
}

/**
 * Checks if an IPv4 address belongs to a private, loopback, link-local,
 * multicast, CGNAT, benchmark, or reserved range.
 */
export function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return false;
  }

  const [p0, p1, p2] = parts;
  if (p0 === undefined || p1 === undefined || p2 === undefined) {
    return false;
  }

  // Current network (RFC 1122: 0.0.0.0/8)
  if (p0 === 0) return true;

  // Loopback (RFC 1122: 127.0.0.0/8)
  if (p0 === 127) return true;

  // Broadcast (RFC 919: 255.255.255.255)
  if (p0 === 255) return true;

  // Link-local / Cloud metadata (RFC 3927: 169.254.0.0/16)
  if (p0 === 169 && p1 === 254) return true;

  // RFC 1918 Private networks:
  // 10.0.0.0/8
  if (p0 === 10) return true;
  // 172.16.0.0/12 (172.16.0.0 - 172.31.255.255)
  if (p0 === 172 && p1 >= 16 && p1 <= 31) return true;
  // 192.168.0.0/16
  if (p0 === 192 && p1 === 168) return true;

  // Carrier-Grade NAT / Shared Address Space (RFC 6598: 100.64.0.0/10 -> 100.64.0.0 - 100.127.255.255)
  if (p0 === 100 && p1 >= 64 && p1 <= 127) return true;

  // IETF Protocol Assignments (RFC 6890: 192.0.0.0/24)
  if (p0 === 192 && p1 === 0 && p2 === 0) return true;

  // Documentation / TEST-NET (RFC 5737):
  // TEST-NET-1: 192.0.2.0/24
  if (p0 === 192 && p1 === 0 && p2 === 2) return true;
  // TEST-NET-2: 198.51.100.0/24
  if (p0 === 198 && p1 === 51 && p2 === 100) return true;
  // TEST-NET-3: 203.0.113.0/24
  if (p0 === 203 && p1 === 0 && p2 === 113) return true;

  // Benchmarking (RFC 2544: 198.18.0.0/15 -> 198.18.0.0 - 198.19.255.255)
  if (p0 === 198 && (p1 === 18 || p1 === 19)) return true;

  // Multicast (RFC 5771: 224.0.0.0/4 -> 224.0.0.0 - 239.255.255.255)
  if (p0 >= 224 && p0 <= 239) return true;

  // Reserved for Future Use (RFC 1112: 240.0.0.0/4 -> 240.0.0.0 - 255.255.255.254)
  if (p0 >= 240) return true;

  return false;
}

/**
 * Normalizes an IPv6 address string into an array of 8 16-bit unsigned integers.
 * Handles compressed zeros (::), IPv4-mapped (::ffff:127.0.0.1), and hex formats.
 * Returns null if the address is not a valid IPv6 format.
 */
export function parseIPv6Words(ip: string): number[] | null {
  const clean = ip.trim().toLowerCase();

  let workingIp = clean;
  let embeddedIPv4Words: number[] | null = null;
  const lastColon = workingIp.lastIndexOf(':');
  if (lastColon !== -1) {
    const possibleIpv4 = workingIp.slice(lastColon + 1);
    if (net.isIPv4(possibleIpv4)) {
      const parts = possibleIpv4.split('.').map(Number);
      if (parts.length === 4 && parts.every((p) => !isNaN(p) && p >= 0 && p <= 255)) {
        const w0 = ((parts[0] ?? 0) << 8) | (parts[1] ?? 0);
        const w1 = ((parts[2] ?? 0) << 8) | (parts[3] ?? 0);
        embeddedIPv4Words = [w0, w1];
        // If the character preceding lastColon is also ':', preserve the '::'
        workingIp =
          lastColon > 0 && workingIp[lastColon - 1] === ':'
            ? workingIp.slice(0, lastColon + 1)
            : workingIp.slice(0, lastColon);
      }
    }
  }

  const doubleColonParts = workingIp.split('::');
  if (doubleColonParts.length > 2) {
    return null;
  }

  const parseHexWords = (part: string): number[] | null => {
    if (!part) return [];
    const segments = part.split(':');
    const words: number[] = [];
    for (const seg of segments) {
      if (!seg) continue;
      if (!/^[0-9a-f]{1,4}$/i.test(seg)) return null;
      words.push(parseInt(seg, 16));
    }
    return words;
  };

  const leftWords = parseHexWords(doubleColonParts[0] ?? '');
  if (leftWords === null) return null;

  const rightWords = doubleColonParts.length === 2 ? parseHexWords(doubleColonParts[1] ?? '') : [];
  if (rightWords === null) return null;

  const expectedWords = 8 - (embeddedIPv4Words ? 2 : 0);

  if (doubleColonParts.length === 1) {
    if (leftWords.length !== expectedWords) return null;
    return embeddedIPv4Words ? [...leftWords, ...embeddedIPv4Words] : leftWords;
  }

  const missingWords = expectedWords - (leftWords.length + rightWords.length);
  if (missingWords < 0) return null;

  const middleWords = new Array(missingWords).fill(0);
  const allWords = [...leftWords, ...middleWords, ...rightWords];
  return embeddedIPv4Words ? [...allWords, ...embeddedIPv4Words] : allWords;
}

/**
 * Checks if an IPv6 address belongs to a private, loopback, link-local,
 * unique local, NAT64, 6to4, discard, or multicast range.
 */
export function isPrivateIPv6(ip: string): boolean {
  const words = parseIPv6Words(ip);
  if (!words || words.length !== 8) {
    // If not parseable as words, fallback to prefix checks
    const normalized = ip.toLowerCase();
    if (normalized === '::1' || normalized === '::') return true;
    if (
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb')
    ) {
      return true;
    }
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
    return false;
  }

  const [w0, w1, w2, w3, w4, w5, w6, w7] = words;
  if (
    w0 === undefined ||
    w1 === undefined ||
    w2 === undefined ||
    w3 === undefined ||
    w4 === undefined ||
    w5 === undefined ||
    w6 === undefined ||
    w7 === undefined
  ) {
    return false;
  }

  // Loopback (::1)
  if (
    w0 === 0 &&
    w1 === 0 &&
    w2 === 0 &&
    w3 === 0 &&
    w4 === 0 &&
    w5 === 0 &&
    w6 === 0 &&
    w7 === 1
  ) {
    return true;
  }

  // Unspecified (::)
  if (
    w0 === 0 &&
    w1 === 0 &&
    w2 === 0 &&
    w3 === 0 &&
    w4 === 0 &&
    w5 === 0 &&
    w6 === 0 &&
    w7 === 0
  ) {
    return true;
  }

  // IPv4-mapped IPv6 (::ffff:0:0/96 or ::ffff:a.b.c.d)
  if (w0 === 0 && w1 === 0 && w2 === 0 && w3 === 0 && w4 === 0 && w5 === 0xffff) {
    const ip4 = `${(w6 >> 8) & 0xff}.${w6 & 0xff}.${(w7 >> 8) & 0xff}.${w7 & 0xff}`;
    return isPrivateIPv4(ip4);
  }

  // Well-Known Prefix IPv4/IPv6 translation NAT64 (RFC 6052: 64:ff9b::/96)
  if (w0 === 0x0064 && w1 === 0xff9b && w2 === 0 && w3 === 0 && w4 === 0 && w5 === 0) {
    const ip4 = `${(w6 >> 8) & 0xff}.${w6 & 0xff}.${(w7 >> 8) & 0xff}.${w7 & 0xff}`;
    return isPrivateIPv4(ip4);
  }

  // 6to4 prefix (RFC 3056: 2002::/16) - embeds IPv4 in w1 and w2
  if (w0 === 0x2002) {
    const ip4 = `${(w1 >> 8) & 0xff}.${w1 & 0xff}.${(w2 >> 8) & 0xff}.${w2 & 0xff}`;
    return isPrivateIPv4(ip4);
  }

  // Unique Local Address (fc00::/7 -> fc00.. to fdff..)
  if ((w0 & 0xfe00) === 0xfc00) return true;

  // Link-local (fe80::/10 -> fe80.. to febf..)
  if ((w0 & 0xffc0) === 0xfe80) return true;

  // Discard prefix (RFC 6666: 100::/64)
  if (w0 === 0x0100 && w1 === 0 && w2 === 0 && w3 === 0) return true;

  // Documentation prefix (RFC 3849: 2001:db8::/32)
  if (w0 === 0x2001 && w1 === 0x0db8) return true;

  // ORCHIDv2 (RFC 7343: 2001:20::/28)
  if (w0 === 0x2001 && (w1 & 0xfff0) === 0x0020) return true;

  // Multicast (ff00::/8)
  if ((w0 & 0xff00) === 0xff00) return true;

  return false;
}

/**
 * Resolves a hostname or IP and verifies that it does not point to a private,
 * loopback, link-local, or cloud-metadata destination or dangerous port
 * when private network blocking is enabled.
 */
export async function assertPublicDestination(urlOrHostname: string): Promise<void> {
  let hostname = urlOrHostname;
  let port: number | undefined;

  try {
    if (urlOrHostname.includes('://')) {
      const u = new URL(urlOrHostname);
      hostname = u.hostname;
      if (u.port) {
        port = parseInt(u.port, 10);
      }
    }
  } catch {
    // Treat as raw hostname
  }

  // Check dangerous / restricted ports
  if (port !== undefined && isRestrictedPort(port)) {
    throw new SecurityUrlError(
      `Destination port ${port} is a restricted protocol port (blocked to prevent cross-protocol SSRF attacks).`,
    );
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
