import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ExitCode } from '../../src/config/exitCodes.js';
import { SuiteRunner } from '../../src/runner/suiteRunner.js';
import type { TestSpecification } from '../../src/spec/types.js';
import { MockServer } from './mockServer.js';

describe('Suite Runner Execution and Exit Codes', () => {
  const mockServer = new MockServer();
  let baseUrl = '';

  beforeAll(async () => {
    baseUrl = await mockServer.start();
  });

  afterAll(async () => {
    await mockServer.stop();
  });

  it('preserves test order under bounded concurrency', async () => {
    const spec: TestSpecification = {
      version: '1.0.0',
      name: 'Order Concurrency Test',
      tests: [
        {
          id: 'test-1',
          name: 'First test',
          request: { method: 'GET', path: '/health' },
          expect: { status: 200 },
        },
        {
          id: 'test-2',
          name: 'Second test',
          request: { method: 'GET', path: '/health' },
          expect: { status: 200 },
        },
        {
          id: 'test-3',
          name: 'Third test',
          request: { method: 'GET', path: '/health' },
          expect: { status: 200 },
        },
        {
          id: 'test-4',
          name: 'Fourth test',
          request: { method: 'GET', path: '/health' },
          expect: { status: 200 },
        },
      ],
    };

    const runner = new SuiteRunner();
    const summary = await runner.runSuite(spec, { baseUrl, concurrency: 3 });

    expect(summary.results.map((r) => r.id)).toEqual(['test-1', 'test-2', 'test-3', 'test-4']);
    expect(summary.exitCode).toBe(ExitCode.SUCCESS);
  });

  it('returns ExitCode.ASSERTION_FAILURE when assertions fail on valid responses', async () => {
    const spec: TestSpecification = {
      version: '1.0.0',
      name: 'Assertion Failure Test',
      tests: [
        {
          id: 'failing-assertion',
          name: 'Fails expected status',
          request: { method: 'GET', path: '/health' },
          expect: { status: 404 }, // Server returns 200
        },
      ],
    };

    const runner = new SuiteRunner();
    const summary = await runner.runSuite(spec, { baseUrl });

    expect(summary.failed).toBe(1);
    expect(summary.errored).toBe(0);
    expect(summary.exitCode).toBe(ExitCode.ASSERTION_FAILURE);
  });

  it('returns ExitCode.TRANSPORT_ERROR when connection cannot be established', async () => {
    const spec: TestSpecification = {
      version: '1.0.0',
      name: 'Transport Error Test',
      tests: [
        {
          id: 'bad-connection',
          name: 'Connection refused endpoint',
          request: { method: 'GET', path: '/health' },
          expect: { status: 200 },
        },
      ],
    };

    const runner = new SuiteRunner();
    // Non-existent loopback port where no server is listening
    const summary = await runner.runSuite(spec, { baseUrl: 'http://127.0.0.1:49999' });

    expect(summary.errored).toBe(1);
    expect(summary.results[0]?.error?.isTransport).toBe(true);
    expect(summary.exitCode).toBe(ExitCode.TRANSPORT_ERROR);
  });

  it('substitutes environment variables and verifies query & headers in mock server', async () => {
    const spec: TestSpecification = {
      version: '1.0.0',
      name: 'Env Substitution Suite',
      tests: [
        {
          id: 'test-env-echo',
          name: 'Verify env interpolation',
          request: {
            method: 'GET',
            path: '/echo-query',
            query: {
              account: '${TEST_ACCOUNT}',
              role: '${TEST_ROLE:-guest}',
            },
            headers: {
              'x-custom-token': 'Bearer ${SECRET_TOKEN}',
            },
          },
          expect: {
            status: 200,
            exact: {
              'query.account': 'acct-777',
              'query.role': 'guest',
            },
          },
        },
      ],
    };

    const runner = new SuiteRunner();
    const summary = await runner.runSuite(spec, {
      baseUrl,
      env: {
        TEST_ACCOUNT: 'acct-777',
        SECRET_TOKEN: 'token-abc-123-xyz',
      },
    });

    expect(summary.passed).toBe(1);
    expect(summary.exitCode).toBe(ExitCode.SUCCESS);
    // Ensure request summary in result redacts the secret token!
    expect(summary.results[0]?.request.headers['x-custom-token']).toBe('[REDACTED]');
  });
});
