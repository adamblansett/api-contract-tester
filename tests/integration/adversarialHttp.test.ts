import * as http from 'node:http';
import { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HttpClient } from '../../src/http/client.js';
import type { HttpRequest } from '../../src/http/types.js';

describe('Adversarial HTTP Execution Tests', () => {
  let server: http.Server;
  let baseUrl = '';

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:0`);

      // 1. Slowloris response body: headers sent immediately, body trickles/hangs
      if (url.pathname === '/slow-body') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.write('{"partial":');
        // Intentionally do not send end() or more data until closed
        const timer = setTimeout(() => {
          if (!res.writableEnded) {
            res.end('"finished"}');
          }
        }, 10000);
        timer.unref();

        req.on('close', () => {
          clearTimeout(timer);
        });
        return;
      }

      // 2. Redirect loop: /loop-a -> /loop-b -> /loop-a
      if (url.pathname === '/loop-a') {
        res.writeHead(302, { Location: '/loop-b' });
        res.end();
        return;
      }
      if (url.pathname === '/loop-b') {
        res.writeHead(302, { Location: '/loop-a' });
        res.end();
        return;
      }

      // 3. Redirect with credentials in Location header
      if (url.pathname === '/redirect-with-credentials') {
        res.writeHead(302, {
          Location: `http://user:pass@127.0.0.1:${(server.address() as AddressInfo).port}/target`,
        });
        res.end();
        return;
      }

      // 4. Redirect 303 for POST -> GET
      if (url.pathname === '/post-redirect') {
        req.on('data', () => {});
        req.on('end', () => {
          res.writeHead(303, { Location: '/target' });
          res.end();
        });
        return;
      }

      if (url.pathname === '/target') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ method: req.method, headers: req.headers }));
        return;
      }

      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const port = (server.address() as AddressInfo).port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      if (typeof server.closeAllConnections === 'function') {
        server.closeAllConnections();
      }
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it('enforces timeout while reading response body streams', async () => {
    const client = new HttpClient();
    const req: HttpRequest = {
      url: `${baseUrl}/slow-body`,
      method: 'GET',
      headers: {},
      timeoutMs: 100, // Timeout after 100ms while waiting for body
      redirect: 'manual',
      maxBodyBytes: 1024 * 1024,
    };

    await expect(client.execute(req)).rejects.toThrow(/timed out/i);
  });

  it('detects and halts redirect loops immediately', async () => {
    const client = new HttpClient();
    const req: HttpRequest = {
      url: `${baseUrl}/loop-a`,
      method: 'GET',
      headers: {},
      timeoutMs: 5000,
      redirect: 'follow-same-origin',
      maxBodyBytes: 1024 * 1024,
    };

    await expect(client.execute(req)).rejects.toThrow(/redirect loop detected/i);
  });

  it('blocks redirect Location headers with embedded credentials', async () => {
    const client = new HttpClient();
    const req: HttpRequest = {
      url: `${baseUrl}/redirect-with-credentials`,
      method: 'GET',
      headers: {},
      timeoutMs: 5000,
      redirect: 'follow-same-origin',
      maxBodyBytes: 1024 * 1024,
    };

    await expect(client.execute(req)).rejects.toThrow(/embedded credentials/i);
  });

  it('drops payload headers when 303 redirects POST to GET', async () => {
    const client = new HttpClient();
    const req: HttpRequest = {
      url: `${baseUrl}/post-redirect`,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': '15',
        'x-client-id': 'client-1',
      },
      body: JSON.stringify({ hello: 'world' }),
      timeoutMs: 5000,
      redirect: 'follow-same-origin',
      maxBodyBytes: 1024 * 1024,
    };

    const response = await client.execute(req);
    expect(response.status).toBe(200);

    const body = response.bodyJson as { method: string; headers: Record<string, string> };
    expect(body.method).toBe('GET');
    // Content-Type and Content-Length must NOT be forwarded to the GET target!
    expect(body.headers['content-type']).toBeUndefined();
    expect(body.headers['content-length']).toBeUndefined();
    // Non-payload headers should be retained
    expect(body.headers['x-client-id']).toBe('client-1');
  });
});
