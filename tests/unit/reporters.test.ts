import { describe, expect, it } from 'vitest';
import { ExitCode } from '../../src/config/exitCodes.js';
import { JsonReporter } from '../../src/reporters/json.js';
import { TerminalReporter } from '../../src/reporters/terminal.js';
import type { SuiteRunSummary } from '../../src/runner/types.js';

describe('Reporters', () => {
  const summary: SuiteRunSummary = {
    specName: 'User Service Tests',
    specVersion: '1.0.0',
    total: 3,
    passed: 1,
    failed: 1,
    skipped: 1,
    errored: 0,
    durationMs: 120,
    exitCode: ExitCode.ASSERTION_FAILURE,
    results: [
      {
        id: 'test-pass',
        name: 'Health check passes',
        status: 'PASSED',
        durationMs: 25,
        request: {
          method: 'GET',
          url: 'http://127.0.0.1:3000/health',
          headers: { authorization: '[REDACTED]' },
        },
        assertions: [
          { name: 'Status Code', passed: true, message: 'Status 200 matches expected 200' },
        ],
      },
      {
        id: 'test-fail',
        name: 'Schema verification fails',
        status: 'FAILED',
        durationMs: 40,
        request: {
          method: 'GET',
          url: 'http://127.0.0.1:3000/users?token=[REDACTED]',
          headers: {},
        },
        response: {
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'application/json' },
          responseTimeMs: 38,
          bodyPreview: '{"error": "field missing"}',
        },
        assertions: [
          {
            name: 'JSON Schema Validation',
            passed: false,
            message: 'root must have required property "id"',
            expected: { type: 'object' },
            actual: {},
          },
        ],
      },
      {
        id: 'test-skip',
        name: 'Skipped future endpoint',
        status: 'SKIPPED',
        durationMs: 0,
        request: {
          method: 'POST',
          url: '/beta',
          headers: {},
        },
        assertions: [],
      },
    ],
  };

  it('generates valid JSON report matching versioned schema', () => {
    const jsonReporter = new JsonReporter();
    const raw = jsonReporter.format(summary);
    const parsed = JSON.parse(raw);

    expect(parsed.schemaVersion).toBe('1.0.0');
    expect(parsed.spec.name).toBe('User Service Tests');
    expect(parsed.summary.total).toBe(3);
    expect(parsed.summary.passed).toBe(1);
    expect(parsed.summary.failed).toBe(1);
    expect(parsed.summary.skipped).toBe(1);
    expect(parsed.summary.exitCode).toBe(ExitCode.ASSERTION_FAILURE);
    expect(parsed.tests).toHaveLength(3);
  });

  it('generates terminal output with diagnostics and counts', () => {
    const termReporter = new TerminalReporter();
    const formatted = termReporter.format(summary);

    expect(formatted).toContain('User Service Tests');
    expect(formatted).toContain('test-pass');
    expect(formatted).toContain('test-fail');
    expect(formatted).toContain('test-skip');
    expect(formatted).toContain('1 passed');
    expect(formatted).toContain('1 failed');
    expect(formatted).toContain('1 skipped');
    expect(formatted).toContain('FAILED');
  });
});
