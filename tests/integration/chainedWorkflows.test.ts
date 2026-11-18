import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SuiteRunner } from '../../src/runner/suiteRunner.js';
import type { TestSpecification } from '../../src/spec/types.js';

describe('Chained Workflows Integration Tests', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1`);

      if (req.method === 'POST' && url.pathname === '/auth/login') {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Set-Cookie': 'session_id=sess_secret_cookie_999; Path=/',
        });
        res.end(
          JSON.stringify({
            token: 'dyn_token_alpha_12345',
            user: {
              id: 'usr_98765',
              role: 'admin',
            },
          }),
        );
        return;
      }

      if (req.method === 'GET' && url.pathname === '/users/usr_98765') {
        const authHeader = req.headers['authorization'];
        if (authHeader !== 'Bearer dyn_token_alpha_12345') {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized', received: authHeader }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            id: 'usr_98765',
            name: 'Alice Admin',
            role: 'admin',
          }),
        );
        return;
      }

      res.writeHead(404);
      res.end();
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

  it('captures response body properties and headers and injects them into downstream tests', async () => {
    const spec: TestSpecification = {
      version: '1.0.0',
      name: 'Chained Authentication and Profile Retrieval',
      config: {
        baseUrl,
        allowDestructive: true,
      },
      tests: [
        {
          id: 'step-1-login',
          name: 'Authenticate User and Capture Token',
          request: {
            method: 'POST',
            path: '/auth/login',
            body: { username: 'alice', password: 'password123' },
          },
          expect: {
            status: 200,
            capture: {
              AUTH_TOKEN: 'body.token',
              USER_ID: 'body.user.id',
            },
          },
        },
        {
          id: 'step-2-profile',
          name: 'Fetch User Profile Using Captured Variables',
          request: {
            method: 'GET',
            path: '/users/${USER_ID}',
            headers: {
              Authorization: 'Bearer ${AUTH_TOKEN}',
            },
          },
          expect: {
            status: 200,
            exact: {
              id: 'usr_98765',
              name: 'Alice Admin',
            },
          },
        },
      ],
    };

    const runner = new SuiteRunner();
    const summary = await runner.runSuite(spec);

    expect(summary.total).toBe(2);
    expect(summary.passed).toBe(2);
    expect(summary.failed).toBe(0);
    expect(summary.errored).toBe(0);

    const step1 = summary.results[0];
    expect(step1?.capturedVariables).toEqual({
      AUTH_TOKEN: 'dyn_token_alpha_12345',
      USER_ID: 'usr_98765',
    });

    const step2 = summary.results[1];
    // Crucial check: Captured USER_ID in URL and Authorization in headers are automatically redacted in reports
    expect(step2?.request.url).toBe(`${baseUrl}/users/[REDACTED]`);
    const authVal =
      step2?.request.headers['Authorization'] ?? step2?.request.headers['authorization'];
    expect(authVal).toBe('[REDACTED]');
  });
});
