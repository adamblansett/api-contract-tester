import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SuiteRunner } from '../../src/runner/suiteRunner.js';
import type { TestSpecification } from '../../src/spec/types.js';
import { MockServer } from './mockServer.js';

describe('Timeouts and Limits Integration Tests', () => {
  const mockServer = new MockServer();
  let baseUrl = '';

  beforeAll(async () => {
    baseUrl = await mockServer.start();
  });

  afterAll(async () => {
    await mockServer.stop();
  });

  it('enforces request timeouts and categorizes as timeout transport error', async () => {
    const spec: TestSpecification = {
      version: '1.0.0',
      name: 'Timeout Test Suite',
      tests: [
        {
          id: 'slow-request',
          name: 'Slow request timeout',
          request: {
            method: 'GET',
            path: '/slow?delay=300',
            timeoutMs: 50, // abort after 50ms
          },
          expect: {
            status: 200,
          },
        },
      ],
    };

    const runner = new SuiteRunner();
    const summary = await runner.runSuite(spec, { baseUrl });

    expect(summary.total).toBe(1);
    expect(summary.errored).toBe(1);
    expect(summary.results[0]?.error?.isTransport).toBe(true);
    expect(summary.results[0]?.error?.isTimeout).toBe(true);
    expect(summary.results[0]?.error?.message).toContain('timed out after 50ms');
  });

  it('enforces maximum response body size limits and aborts payload streaming', async () => {
    const spec: TestSpecification = {
      version: '1.0.0',
      name: 'Payload Limit Test Suite',
      tests: [
        {
          id: 'oversized-body',
          name: 'Oversized body limit check',
          request: {
            method: 'GET',
            path: '/large',
          },
          expect: {
            status: 200,
          },
        },
      ],
    };

    const runner = new SuiteRunner();
    // Cap maxBodyBytes to 256 KB (server sends 2 MB)
    const summary = await runner.runSuite(spec, { baseUrl, maxBodyBytes: 256 * 1024 });

    expect(summary.total).toBe(1);
    expect(summary.errored).toBe(1);
    expect(summary.results[0]?.error?.message).toContain('Response body size limit exceeded');
  });
});
