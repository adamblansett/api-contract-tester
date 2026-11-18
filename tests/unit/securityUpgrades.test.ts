import { describe, expect, it } from 'vitest';
import { assertMatches } from '../../src/assertions/matches.js';
import type { HttpResponse } from '../../src/http/types.js';
import {
  assertPublicDestination,
  isPrivateIPv4,
  isPrivateIPv6,
  isRestrictedPort,
  parseIPv6Words,
} from '../../src/security/dns.js';
import { assertValidHeaders, HeaderSecurityError } from '../../src/security/guards.js';
import { RedactionRegistry } from '../../src/security/redaction.js';
import { SecurityUrlError } from '../../src/security/url.js';
import {
  CaptureVariableSchema,
  HeaderNameSchema,
  HeaderValueSchema,
} from '../../src/spec/schema.js';
import { validateSpecification } from '../../src/spec/validator.js';

describe('Security Upgrades Unit Tests', () => {
  describe('SSRF & IP Evasion Hardening', () => {
    it('detects expanded IPv4 dangerous and non-routable ranges', () => {
      // CGNAT (RFC 6598: 100.64.0.0/10)
      expect(isPrivateIPv4('100.64.0.1')).toBe(true);
      expect(isPrivateIPv4('100.127.255.255')).toBe(true);
      expect(isPrivateIPv4('100.128.0.1')).toBe(false);

      // Current network / broadcast (RFC 1122 / 919)
      expect(isPrivateIPv4('0.0.0.0')).toBe(true);
      expect(isPrivateIPv4('255.255.255.255')).toBe(true);

      // Documentation (RFC 5737: 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24)
      expect(isPrivateIPv4('192.0.2.1')).toBe(true);
      expect(isPrivateIPv4('198.51.100.1')).toBe(true);
      expect(isPrivateIPv4('203.0.113.1')).toBe(true);

      // Benchmarking (RFC 2544: 198.18.0.0/15)
      expect(isPrivateIPv4('198.18.0.1')).toBe(true);
      expect(isPrivateIPv4('198.19.255.255')).toBe(true);
      expect(isPrivateIPv4('198.20.0.1')).toBe(false);

      // Multicast & Reserved (RFC 5771 / 1112)
      expect(isPrivateIPv4('224.0.0.1')).toBe(true);
      expect(isPrivateIPv4('239.255.255.255')).toBe(true);
      expect(isPrivateIPv4('240.0.0.1')).toBe(true);

      // Known public IPs
      expect(isPrivateIPv4('8.8.8.8')).toBe(false);
      expect(isPrivateIPv4('1.1.1.1')).toBe(false);
      expect(isPrivateIPv4('142.250.190.46')).toBe(false);
    });

    it('correctly parses IPv6 into 8 words across all formats', () => {
      const loopbackWords = parseIPv6Words('::1');
      expect(loopbackWords).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);

      const uncompressedWords = parseIPv6Words('0000:0000:0000:0000:0000:0000:0000:0001');
      expect(uncompressedWords).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);

      const ipv4MappedWords = parseIPv6Words('::ffff:127.0.0.1');
      expect(ipv4MappedWords).toEqual([0, 0, 0, 0, 0, 0xffff, 0x7f00, 0x0001]);

      const hexIpv4MappedWords = parseIPv6Words('::ffff:7f00:1');
      expect(hexIpv4MappedWords).toEqual([0, 0, 0, 0, 0, 0xffff, 0x7f00, 0x0001]);
    });

    it('detects expanded IPv6 dangerous ranges and embedding evasions', () => {
      // Loopback variants
      expect(isPrivateIPv6('::1')).toBe(true);
      expect(isPrivateIPv6('0:0:0:0:0:0:0:1')).toBe(true);
      expect(isPrivateIPv6('0000:0000:0000:0000:0000:0000:0000:0001')).toBe(true);
      expect(isPrivateIPv6('::')).toBe(true);

      // IPv4-mapped IPv6 (dotted and hex)
      expect(isPrivateIPv6('::ffff:127.0.0.1')).toBe(true);
      expect(isPrivateIPv6('::ffff:7f00:1')).toBe(true);
      expect(isPrivateIPv6('::ffff:169.254.169.254')).toBe(true);
      expect(isPrivateIPv6('::ffff:10.0.0.1')).toBe(true);

      // NAT64 prefix (RFC 6052: 64:ff9b::/96)
      expect(isPrivateIPv6('64:ff9b::127.0.0.1')).toBe(true);
      expect(isPrivateIPv6('64:ff9b::169.254.169.254')).toBe(true);

      // 6to4 prefix (RFC 3056: 2002::/16)
      expect(isPrivateIPv6('2002:7f00:0001::')).toBe(true); // 127.0.0.1 embedded

      // Unique local, link-local, discard, documentation, multicast
      expect(isPrivateIPv6('fc00::1')).toBe(true);
      expect(isPrivateIPv6('fd12:3456:789a::1')).toBe(true);
      expect(isPrivateIPv6('fe80::1')).toBe(true);
      expect(isPrivateIPv6('100::1')).toBe(true);
      expect(isPrivateIPv6('2001:db8::1')).toBe(true);
      expect(isPrivateIPv6('ff02::1')).toBe(true);

      // Public IPv6
      expect(isPrivateIPv6('2607:f8b0:4005:805::200e')).toBe(false);
    });

    it('blocks restricted WHATWG protocol ports to prevent cross-protocol SSRF', async () => {
      expect(isRestrictedPort(25)).toBe(true); // SMTP
      expect(isRestrictedPort(22)).toBe(true); // SSH
      expect(isRestrictedPort(445)).toBe(true); // SMB
      expect(isRestrictedPort(80)).toBe(false);
      expect(isRestrictedPort(443)).toBe(false);
      expect(isRestrictedPort(8080)).toBe(false);

      await expect(assertPublicDestination('http://example.com:25')).rejects.toThrow(
        SecurityUrlError,
      );
      await expect(assertPublicDestination('http://example.com:25')).rejects.toThrow(
        /restricted protocol port/,
      );
    });
  });

  describe('Header & CRLF Injection Prevention', () => {
    it('validates header names and rejects CRLF and control characters', () => {
      expect(() => assertValidHeaders({ 'X-Custom-Header': 'valid' })).not.toThrow();

      // CRLF in header name
      expect(() => assertValidHeaders({ 'X-Injected\r\nHost': 'evil.com' })).toThrow(
        HeaderSecurityError,
      );
      // Spaces or colons in header name
      expect(() => assertValidHeaders({ 'X Header': 'val' })).toThrow(HeaderSecurityError);
      expect(() => assertValidHeaders({ 'X:Header': 'val' })).toThrow(HeaderSecurityError);

      // Prototype pollution vector names
      expect(() => assertValidHeaders({ ['__proto__']: 'polluted' })).toThrow(HeaderSecurityError);
      expect(() => assertValidHeaders({ constructor: 'polluted' })).toThrow(HeaderSecurityError);
      expect(() => assertValidHeaders({ prototype: 'polluted' })).toThrow(HeaderSecurityError);
    });

    it('validates header values and rejects CRLF and null bytes', () => {
      expect(() => assertValidHeaders({ 'Content-Type': 'application/json' })).not.toThrow();

      // CRLF injection in value
      expect(() => assertValidHeaders({ 'X-Test': 'val\r\nInjected-Header: evil' })).toThrow(
        HeaderSecurityError,
      );
      expect(() => assertValidHeaders({ 'X-Test': 'val\nInjected-Header: evil' })).toThrow(
        HeaderSecurityError,
      );
      expect(() => assertValidHeaders({ 'X-Test': 'val\0null' })).toThrow(HeaderSecurityError);
    });

    it('rejects CRLF and prototype keys at schema validation level', () => {
      expect(() => HeaderNameSchema.parse('X-Injected\r\n')).toThrow();
      expect(() => HeaderNameSchema.parse('__proto__')).toThrow();
      expect(() => HeaderValueSchema.parse('line1\r\nline2')).toThrow();

      const invalidSpec = {
        version: '1.0.0',
        name: 'CRLF Test',
        tests: [
          {
            id: 't-crlf',
            name: 'CRLF Attack',
            request: {
              method: 'GET',
              path: '/test',
              headers: {
                'X-Injected\r\n': 'value',
              },
            },
            expect: {
              status: 200,
            },
          },
        ],
      };

      const result = validateSpecification(invalidSpec);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path.includes('headers'))).toBe(true);
    });
  });

  describe('Advanced Secret & PII Redaction', () => {
    const registry = new RedactionRegistry();

    it('automatically redacts JWT tokens from text output', () => {
      const sampleJwt =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      const output = registry.redactText(`Received token: ${sampleJwt}`);
      expect(output).not.toContain('eyJhbGciOi');
      expect(output).toContain('[REDACTED_JWT]');
    });

    it('automatically redacts AWS Access Key IDs', () => {
      const output = registry.redactText('AWS Credential AKIAIOSFODNN7EXAMPLE used in request');
      expect(output).not.toContain('AKIAIOSFODNN7EXAMPLE');
      expect(output).toContain('[REDACTED_AWS_KEY]');
    });

    it('automatically redacts PEM Private Key blocks', () => {
      const pemKey =
        '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA04...\n-----END RSA PRIVATE KEY-----';
      const output = registry.redactText(`Config error with key: ${pemKey}`);
      expect(output).not.toContain('MIIEowIBAAKCAQEA04');
      expect(output).toContain('[REDACTED_PRIVATE_KEY]');
    });

    it('redacts sensitive numbers and booleans in redactDeep without prototype pollution', () => {
      const payload = {
        user: 'alice',
        pin: 123456,
        cvv: 789,
        __proto__: { polluted: true },
      };

      const redacted = registry.redactDeep(payload);
      expect(redacted.pin).toBe('[REDACTED]');
      expect(redacted.cvv).toBe('[REDACTED]');
      expect(redacted.user).toBe('alice');
      // Ensure prototype property was not injected
      expect(Object.prototype.hasOwnProperty.call(redacted, '__proto__')).toBe(false);
    });
  });

  describe('Prototype Pollution Protection in Variable Capture', () => {
    it('validates variable capture names at schema level', () => {
      expect(CaptureVariableSchema.parse('AUTH_TOKEN')).toBe('AUTH_TOKEN');
      expect(CaptureVariableSchema.parse('user_id')).toBe('user_id');

      expect(() => CaptureVariableSchema.parse('__proto__')).toThrow();
      expect(() => CaptureVariableSchema.parse('constructor')).toThrow();
      expect(() => CaptureVariableSchema.parse('prototype')).toThrow();
      expect(() => CaptureVariableSchema.parse('invalid-var-name!')).toThrow();
    });
  });

  describe('ReDoS Guard in Regex Assertions', () => {
    const mockResponse: HttpResponse = {
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json' },
      bodyText: '{"data":"test"}',
      bodyJson: { data: 'test' },
      responseTimeMs: 10,
      redirectCount: 0,
      finalUrl: 'http://127.0.0.1/test',
    };

    it('rejects regex patterns exceeding maximum length', () => {
      const hugePattern = 'a'.repeat(1001);
      const results = assertMatches(mockResponse, { 'body.data': hugePattern });
      expect(results[0]?.passed).toBe(false);
      expect(results[0]?.message).toContain('exceeds maximum security limit of 1000 characters');
    });

    it('rejects target values exceeding 64KB for regex matching', () => {
      const largeResponse: HttpResponse = {
        ...mockResponse,
        bodyJson: { data: 'x'.repeat(70000) },
      };
      const results = assertMatches(largeResponse, { 'body.data': '^x+$' });
      expect(results[0]?.passed).toBe(false);
      expect(results[0]?.message).toContain('exceeds 64KB evaluation limit for regex assertions');
    });
  });
});
