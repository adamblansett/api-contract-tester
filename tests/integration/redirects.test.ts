import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SuiteRunner } from '../../src/runner/suiteRunner.js';
import type { TestSpecification } from '../../src/spec/types.js';
import { MockServer } from './mockServer.js';

describe('Redirect Behavior Integration Tests', () => {
  const mockServer = new MockServer();
  let baseUrl = '';

  beforeAll(async () => {
    baseUrl = await mockServer.start();
  });

  afterAll(async () => {
    await mockServer.stop();
  });

  it('handles redirect manually by default without following', async () => {
    const spec: TestSpecification = {
      version: '1.0.0',
      name: 'Manual Redirects',
      tests: [
        {
          id: 'manual-redirect',
          name: 'Manual redirect inspection',
          request: {
            method: 'GET',
            path: '/redirect-same',
            redirect: 'manual',
          },
          expect: {
            status: 302,
            headers: { required: ['location'] },
          },
        },
      ],
    };

    const runner = new SuiteRunner();
    const summary = await runner.runSuite(spec, { baseUrl });

    expect(summary.passed).toBe(1);
    expect(summary.results[0]?.response?.status).toBe(302);
  });

  it('follows same-origin redirects when configured', async () => {
    const spec: TestSpecification = {
      version: '1.0.0',
      name: 'Follow Same Origin',
      tests: [
        {
          id: 'follow-redirect',
          name: 'Follow same origin redirect',
          request: {
            method: 'GET',
            path: '/redirect-same',
            redirect: 'follow-same-origin',
          },
          expect: {
            status: 200,
            hasProperties: ['status'],
            exact: { status: 'ok' },
          },
        },
      ],
    };

    const runner = new SuiteRunner();
    const summary = await runner.runSuite(spec, { baseUrl });

    expect(summary.passed).toBe(1);
    expect(summary.results[0]?.response?.status).toBe(200);
  });

  it('blocks cross-origin redirects under follow-same-origin policy', async () => {
    const spec: TestSpecification = {
      version: '1.0.0',
      name: 'Block Cross Origin',
      tests: [
        {
          id: 'block-cross-origin',
          name: 'Block cross origin redirect',
          request: {
            method: 'GET',
            path: '/redirect-cross',
            redirect: 'follow-same-origin',
          },
          expect: {
            status: 200,
          },
        },
      ],
    };

    const runner = new SuiteRunner();
    const summary = await runner.runSuite(spec, { baseUrl });

    expect(summary.errored).toBe(1);
    expect(summary.results[0]?.error?.message).toContain('Cross-origin redirect');
  });

  it('errors when redirect encountered under redirect "error" policy', async () => {
    const spec: TestSpecification = {
      version: '1.0.0',
      name: 'Error On Redirect',
      tests: [
        {
          id: 'error-on-redirect',
          name: 'Error policy on redirect',
          request: {
            method: 'GET',
            path: '/redirect-same',
            redirect: 'error',
          },
          expect: {
            status: 200,
          },
        },
      ],
    };

    const runner = new SuiteRunner();
    const summary = await runner.runSuite(spec, { baseUrl });

    expect(summary.errored).toBe(1);
    expect(summary.results[0]?.error?.message).toContain('Unexpected redirect 302 encountered');
  });
});
