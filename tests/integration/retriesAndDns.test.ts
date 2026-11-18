import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HttpClient } from '../../src/http/client.js';
import { SuiteRunner } from '../../src/runner/suiteRunner.js';
import { assertPublicDestination, isPrivateIPv4, isPrivateIPv6 } from '../../src/security/dns.js';
import { SecurityUrlError } from '../../src/security/url.js';
import type { TestSpecification } from '../../src/spec/types.js';

describe('Retries and DNS Private Network Shield Tests', () => {
  let server: http.Server;
  let baseUrl: string;
  let attempts = 0;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      attempts++;
      // Fail on the first 2 attempts by destroying socket (transport error), succeed on 3rd attempt
      if (attempts < 3) {
        req.socket.destroy();
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', attempt: attempts }));
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (address && typeof address === 'object') {
          baseUrl = `http://127.0.0.1:${address.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  describe('Request Retries', () => {
    it('retries on transport errors and succeeds when maxAttempts is sufficient', async () => {
      attempts = 0;
      const client = new HttpClient();

      const response = await client.execute({
        url: `${baseUrl}/flaky`,
        method: 'GET',
        headers: {},
        timeoutMs: 5000,
        redirect: 'manual',
        maxBodyBytes: 1048576,
        retry: {
          maxAttempts: 3,
          backoffMs: 20,
        },
      });

      expect(response.status).toBe(200);
      expect(attempts).toBe(3);
      expect((response.bodyJson as { attempt: number }).attempt).toBe(3);
    });

    it('fails when maxAttempts is exceeded', async () => {
      attempts = 0;
      const client = new HttpClient();

      await expect(
        client.execute({
          url: `${baseUrl}/flaky`,
          method: 'GET',
          headers: {},
          timeoutMs: 5000,
          redirect: 'manual',
          maxBodyBytes: 1048576,
          retry: {
            maxAttempts: 2,
            backoffMs: 10,
          },
        }),
      ).rejects.toThrow();

      expect(attempts).toBe(2);
    });
  });

  describe('Private Network IP Detection', () => {
    it('detects IPv4 private, loopback, and link-local ranges', () => {
      expect(isPrivateIPv4('127.0.0.1')).toBe(true);
      expect(isPrivateIPv4('127.255.0.1')).toBe(true);
      expect(isPrivateIPv4('169.254.169.254')).toBe(true);
      expect(isPrivateIPv4('10.0.0.1')).toBe(true);
      expect(isPrivateIPv4('172.16.0.1')).toBe(true);
      expect(isPrivateIPv4('172.31.255.255')).toBe(true);
      expect(isPrivateIPv4('192.168.1.1')).toBe(true);
      expect(isPrivateIPv4('0.0.0.0')).toBe(true);

      // Public IPs
      expect(isPrivateIPv4('8.8.8.8')).toBe(false);
      expect(isPrivateIPv4('1.1.1.1')).toBe(false);
      expect(isPrivateIPv4('142.250.190.46')).toBe(false);
    });

    it('detects IPv6 private and loopback ranges', () => {
      expect(isPrivateIPv6('::1')).toBe(true);
      expect(isPrivateIPv6('fe80::1')).toBe(true);
      expect(isPrivateIPv6('fc00::1')).toBe(true);
      expect(isPrivateIPv6('fd12:3456::1')).toBe(true);
      expect(isPrivateIPv6('::ffff:127.0.0.1')).toBe(true);

      // Public IPv6
      expect(isPrivateIPv6('2001:4860:4860::8888')).toBe(false);
    });

    it('throws SecurityUrlError when assertPublicDestination encounters private IP', async () => {
      await expect(assertPublicDestination('127.0.0.1')).rejects.toThrow(SecurityUrlError);
      await expect(
        assertPublicDestination('http://169.254.169.254/latest/meta-data'),
      ).rejects.toThrow(SecurityUrlError);
      await expect(assertPublicDestination('http://192.168.1.100/admin')).rejects.toThrow(
        SecurityUrlError,
      );
    });

    it('blocks request execution when blockPrivateNetworks is active', async () => {
      const spec: TestSpecification = {
        version: '1.0.0',
        name: 'Private Network Test',
        config: {
          baseUrl,
          blockPrivateNetworks: true,
        },
        tests: [
          {
            id: 't-private-block',
            name: 'Attempt to reach local server',
            request: {
              method: 'GET',
              path: '/probe',
            },
            expect: {
              status: 200,
            },
          },
        ],
      };

      const runner = new SuiteRunner();
      const summary = await runner.runSuite(spec);

      expect(summary.total).toBe(1);
      expect(summary.errored).toBe(1);
      expect(summary.results[0]?.status).toBe('ERROR');
      expect(summary.results[0]?.error?.message).toContain('blocked by --block-private-networks');
    });
  });
});
