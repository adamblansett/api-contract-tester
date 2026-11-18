import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { ExitCode } from '../../config/exitCodes.js';
import type { TestCase, TestSpecification } from '../../spec/types.js';
import { validateSpecification } from '../../spec/validator.js';

export interface MockServerOptions {
  port?: number;
  host?: string;
}

function matchRoute(routePath: string, reqPath: string): boolean {
  if (routePath === reqPath) return true;

  // Convert template params like ${id} or :id into regex wildcards
  const pattern = routePath.replace(/\$\{[^}]+\}/g, '[^/]+').replace(/:[a-zA-Z0-9_-]+/g, '[^/]+');

  const regex = new RegExp(`^${pattern}$`);
  return regex.test(reqPath);
}

export async function runMockServerCommand(
  specPath: string,
  options: MockServerOptions = {},
): Promise<number> {
  const resolvedPath = path.resolve(process.cwd(), specPath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(pc.red(`Specification file not found: ${resolvedPath}`));
    return ExitCode.SPEC_ERROR;
  }

  let rawSpec: unknown;
  try {
    rawSpec = JSON.parse(fs.readFileSync(resolvedPath, 'utf-8'));
  } catch (err) {
    console.error(
      pc.red(
        `Failed to parse specification JSON: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
    return ExitCode.SPEC_ERROR;
  }

  const validation = validateSpecification(rawSpec);
  if (!validation.valid || !validation.spec) {
    console.error(pc.red('Specification validation failed:'));
    for (const err of validation.errors) {
      console.error(pc.red(`  • [${err.path}]: ${err.message}`));
    }
    return ExitCode.SPEC_ERROR;
  }

  const spec: TestSpecification = validation.spec;
  const port = options.port ?? 3000;
  const host = options.host ?? '127.0.0.1';

  if (host === '0.0.0.0' || host === '::') {
    console.warn(
      pc.yellow(
        `\n⚠ Warning: Binding mock server to "${host}" exposes it to all network interfaces. Use 127.0.0.1 for local isolation.\n`,
      ),
    );
  }

  const server = http.createServer((req, res) => {
    // Mitigate DoS via unbounded mock request bodies
    let bytesReceived = 0;
    const MAX_MOCK_PAYLOAD_BYTES = 5 * 1024 * 1024;
    req.on('data', (chunk: Buffer) => {
      bytesReceived += chunk.length;
      if (bytesReceived > MAX_MOCK_PAYLOAD_BYTES) {
        res.writeHead(413, {
          'Content-Type': 'application/json',
          'X-Content-Type-Options': 'nosniff',
        });
        res.end(
          JSON.stringify({
            error: 'Payload Too Large',
            message: `Mock request exceeded ${MAX_MOCK_PAYLOAD_BYTES} bytes limit`,
          }),
        );
        req.destroy();
      }
    });

    const parsedUrl = new URL(req.url ?? '/', `http://${host}:${port}`);
    const reqPath = parsedUrl.pathname;
    const reqMethod = req.method?.toUpperCase() ?? 'GET';

    // Find matching test
    const matchedTest = spec.tests.find(
      (t: TestCase) =>
        t.request.method.toUpperCase() === reqMethod && matchRoute(t.request.path, reqPath),
    );

    if (matchedTest) {
      let statusCode = 200;
      if (typeof matchedTest.expect.status === 'number') {
        statusCode = matchedTest.expect.status;
      } else if (Array.isArray(matchedTest.expect.status)) {
        const first = matchedTest.expect.status[0];
        statusCode = typeof first === 'number' ? first : 200;
      } else if (typeof matchedTest.expect.status === 'string') {
        const prefix = parseInt(matchedTest.expect.status.charAt(0), 10);
        statusCode = isNaN(prefix) ? 200 : prefix * 100;
      }

      const contentType = matchedTest.expect.contentType ?? 'application/json';
      let bodyData: string;

      if (matchedTest.expect.exact) {
        bodyData = JSON.stringify(matchedTest.expect.exact);
      } else if (matchedTest.expect.contains) {
        bodyData = JSON.stringify(matchedTest.expect.contains);
      } else {
        bodyData = JSON.stringify({
          mocked: true,
          testId: matchedTest.id,
          name: matchedTest.name,
          timestamp: new Date().toISOString(),
        });
      }

      res.writeHead(statusCode, {
        'Content-Type': contentType,
        'X-Mocked-By': 'api-contract-tester',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Cache-Control': 'no-store',
      });
      res.end(bodyData);

      console.log(
        `  ${pc.green('✔')} ${pc.bold(reqMethod)} ${reqPath} -> ${pc.cyan(String(statusCode))} (matched "${matchedTest.id}")`,
      );
    } else {
      res.writeHead(404, {
        'Content-Type': 'application/json',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Cache-Control': 'no-store',
      });
      res.end(
        JSON.stringify({
          error: 'Not Found',
          message: `No mock route matched ${reqMethod} ${reqPath}`,
          availableRoutes: spec.tests.map((t) => `${t.request.method} ${t.request.path}`),
        }),
      );

      console.log(
        `  ${pc.yellow('○')} ${pc.bold(reqMethod)} ${reqPath} -> ${pc.red('404 Not Found')}`,
      );
    }
  });

  return new Promise((resolve) => {
    server.listen(port, host, () => {
      console.log('');
      console.log(pc.bold(pc.cyan('API Contract Tester Mock Server')));
      console.log(pc.gray('─'.repeat(60)));
      console.log(`  Suite:   ${pc.bold(spec.name)} (v${spec.version})`);
      console.log(`  Routes:  ${spec.tests.length} routes registered`);
      console.log(`  Server:  ${pc.green(`http://${host}:${port}`)}`);
      console.log(pc.gray('─'.repeat(60)));
      console.log(pc.dim('  Press Ctrl+C to terminate mock server'));
      console.log('');
    });

    const shutdown = () => {
      console.log('\nStopping mock server...');
      server.close(() => {
        resolve(ExitCode.SUCCESS);
      });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });
}
