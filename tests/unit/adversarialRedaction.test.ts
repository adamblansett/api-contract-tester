import { describe, expect, it } from 'vitest';
import type { HttpClient } from '../../src/http/client.js';
import { JsonReporter } from '../../src/reporters/json.js';
import { TerminalReporter } from '../../src/reporters/terminal.js';
import { TestExecutor } from '../../src/runner/executor.js';
import { RedactionRegistry } from '../../src/security/redaction.js';
import type { TestCase, TestSpecification } from '../../src/spec/types.js';

describe('Adversarial Secret Redaction Tests', () => {
  it('redacts URL-encoded variants of registered secrets', () => {
    const registry = new RedactionRegistry();
    const literalSecret = 'super secret token!';
    registry.addSecret(literalSecret);

    const textWithLiteral = `Failed: ${literalSecret}`;
    const textWithEncoded = `Failed: ${encodeURIComponent(literalSecret)}`;

    expect(registry.redactText(textWithLiteral)).toBe('Failed: [REDACTED]');
    expect(registry.redactText(textWithEncoded)).toBe('Failed: [REDACTED]');
  });

  it('redacts secrets from URL paths, query parameters, and embedded credentials', () => {
    const registry = new RedactionRegistry(['secret_user_id_999']);
    const rawUrl =
      'http://admin_user:secret_pwd@127.0.0.1:3000/users/secret_user_id_999?api_key=secret_user_id_999&limit=10';

    const redacted = registry.redactUrl(rawUrl);

    expect(redacted).not.toContain('secret_pwd');
    expect(redacted).not.toContain('admin_user');
    expect(redacted).not.toContain('secret_user_id_999');
    expect(redacted).toContain('/users/[REDACTED]');
    expect(redacted).toContain('api_key=%5BREDACTED%5D');
    expect(redacted).toContain('limit=10');
  });

  it('redacts synthetic secrets from assertion failure diagnostics, expected, and actual fields', async () => {
    const SYNTHETIC_SECRET = 'SYNTH_SECRET_ALPHA_987654';
    const registry = new RedactionRegistry([SYNTHETIC_SECRET]);

    // Mock HTTP client returning a response containing the synthetic secret
    const mockHttpClient = {
      execute: async () => ({
        status: 200,
        statusText: 'OK',
        headers: {
          'x-sensitive-token': SYNTHETIC_SECRET,
          'content-type': 'application/json',
        },
        bodyText: JSON.stringify({ token: SYNTHETIC_SECRET }),
        bodyJson: { token: SYNTHETIC_SECRET },
        responseTimeMs: 25,
        redirectCount: 0,
        finalUrl: 'http://127.0.0.1:3000/auth',
      }),
    };

    const executor = new TestExecutor(mockHttpClient as unknown as HttpClient, registry);

    const testCase: TestCase = {
      id: 'leak-test',
      name: 'Verify secret does not leak on failure',
      request: {
        method: 'GET',
        path: '/auth',
        headers: {
          'X-Custom-Secret': SYNTHETIC_SECRET,
        },
      },
      expect: {
        status: 200,
        headers: {
          required: { 'x-sensitive-token': 'wrong-value' }, // Deliberate failure
        },
        exact: {
          token: 'expected-different-value', // Deliberate failure
        },
      },
    };

    const spec: TestSpecification = {
      version: '1.0.0',
      name: 'Leak Test Suite',
      config: { baseUrl: 'http://127.0.0.1:3000' },
      tests: [testCase],
    };

    const result = await executor.executeTest(testCase, spec, {
      env: { MY_TOKEN: SYNTHETIC_SECRET },
    });

    expect(result.status).toBe('FAILED');

    // 1. Check request headers
    expect(result.request.headers['X-Custom-Secret']).toBe('[REDACTED]');

    // 2. Check response headers
    expect(result.response?.headers['x-sensitive-token']).toBe('[REDACTED]');

    // 3. Check assertions: message, expected, actual MUST NOT contain literal SYNTHETIC_SECRET!
    for (const assertion of result.assertions) {
      expect(assertion.message).not.toContain(SYNTHETIC_SECRET);
      if (typeof assertion.expected === 'string') {
        expect(assertion.expected).not.toContain(SYNTHETIC_SECRET);
      }
      if (typeof assertion.actual === 'string') {
        expect(assertion.actual).not.toContain(SYNTHETIC_SECRET);
      }
    }

    // 4. Verify terminal output
    const termReporter = new TerminalReporter();
    const terminalOutput = termReporter.format({
      specName: spec.name,
      specVersion: spec.version,
      total: 1,
      passed: 0,
      failed: 1,
      skipped: 0,
      errored: 0,
      durationMs: 30,
      exitCode: 1,
      results: [result],
    });
    expect(terminalOutput).not.toContain(SYNTHETIC_SECRET);

    // 5. Verify JSON output
    const jsonReporter = new JsonReporter();
    const jsonOutput = jsonReporter.format({
      specName: spec.name,
      specVersion: spec.version,
      total: 1,
      passed: 0,
      failed: 1,
      skipped: 0,
      errored: 0,
      durationMs: 30,
      exitCode: 1,
      results: [result],
    });
    expect(jsonOutput).not.toContain(SYNTHETIC_SECRET);
  });
});
