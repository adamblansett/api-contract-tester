import * as http from 'node:http';
import { AddressInfo } from 'node:net';

export class MockServer {
  private server: http.Server;
  private port = 0;

  constructor() {
    this.server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${this.port}`);
      const pathname = url.pathname;
      const method = req.method ?? 'GET';

      // 1. Slow endpoint for timeout testing
      if (pathname === '/slow') {
        const delay = parseInt(url.searchParams.get('delay') ?? '1000', 10);
        const timer = setTimeout(() => {
          if (!res.writableEnded) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ delayed: true }));
          }
        }, delay);
        timer.unref();

        req.on('close', () => {
          clearTimeout(timer);
        });
        return;
      }

      // 2. Oversized payload endpoint (2 MB)
      if (pathname === '/large') {
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
        const chunkSize = 512 * 1024; // 512 KB
        for (let i = 0; i < 4; i++) {
          if (res.writableEnded) break;
          res.write(Buffer.alloc(chunkSize, 'A'));
        }
        res.end();
        return;
      }

      // 3. Redirects
      if (pathname === '/redirect-same') {
        res.writeHead(302, { Location: '/health' });
        res.end();
        return;
      }

      if (pathname === '/redirect-cross') {
        res.writeHead(302, { Location: 'http://127.0.0.1:54321/external' });
        res.end();
        return;
      }

      // 4. Standard endpoints
      if (pathname === '/health' && method === 'GET') {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'X-Service-Name': 'mock-api',
        });
        res.end(JSON.stringify({ status: 'ok', uptime: 100 }));
        return;
      }

      if (pathname === '/health' && method === 'HEAD') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end();
        return;
      }

      if (pathname === '/api' && method === 'OPTIONS') {
        res.writeHead(204, { Allow: 'GET, POST, OPTIONS', 'Content-Type': 'text/plain' });
        res.end();
        return;
      }

      if (pathname === '/echo-headers') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ headers: req.headers }));
        return;
      }

      if (pathname === '/echo-query') {
        const query: Record<string, string> = {};
        for (const [k, v] of url.searchParams.entries()) {
          query[k] = v;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ query }));
        return;
      }

      // Destructive methods (CRUD)
      if (pathname === '/users' && method === 'POST') {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', () => {
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ id: 'u-1', received: body ? JSON.parse(body) : null }));
        });
        return;
      }

      if (pathname === '/users/1' && method === 'PUT') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: 1, updated: true }));
        return;
      }

      if (pathname === '/users/1' && method === 'PATCH') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: 1, patched: true }));
        return;
      }

      if (pathname === '/users/1' && method === 'DELETE') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (pathname === '/users/schema-test') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: 42, email: 'valid@example.com' }));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not Found' }));
    });
  }

  public async start(): Promise<string> {
    return new Promise((resolve) => {
      this.server.listen(0, '127.0.0.1', () => {
        const addr = this.server.address() as AddressInfo;
        this.port = addr.port;
        resolve(`http://127.0.0.1:${this.port}`);
      });
    });
  }

  public async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof this.server.closeAllConnections === 'function') {
        this.server.closeAllConnections();
      }
      this.server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  public get baseUrl(): string {
    return `http://127.0.0.1:${this.port}`;
  }
}
