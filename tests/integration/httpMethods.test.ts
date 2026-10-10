import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SuiteRunner } from '../../src/runner/suiteRunner.js';
import type { TestSpecification } from '../../src/spec/types.js';
import { MockServer } from './mockServer.js';

describe('HTTP Methods Integration Tests', () => {
  const mockServer = new MockServer();
  let baseUrl = '';

  beforeAll(async () => {
    baseUrl = await mockServer.start();
  });

  afterAll(async () => {
    await mockServer.stop();
  });

  it('executes safe methods (GET, HEAD, OPTIONS) without destructive flag', async () => {
    const spec: TestSpecification = {
      version: '1.0.0',
      name: 'Safe Methods Test Suite',
      tests: [
        {
          id: 'get-health',
          name: 'GET health check',
          request: { method: 'GET', path: '/health' },
          expect: {
            status: 200,
            headers: { required: ['x-service-name'] },
            hasProperties: ['status', 'uptime'],
            exact: { status: 'ok' },
          },
        },
        {
          id: 'head-health',
          name: 'HEAD health check',
          request: { method: 'HEAD', path: '/health' },
          expect: {
            status: 200,
          },
        },
        {
          id: 'options-api',
          name: 'OPTIONS API info',
          request: { method: 'OPTIONS', path: '/api' },
          expect: {
            status: 204,
            headers: { required: ['allow'] },
          },
        },
      ],
    };

    const runner = new SuiteRunner();
    const summary = await runner.runSuite(spec, { baseUrl });

    expect(summary.total).toBe(3);
    expect(summary.passed).toBe(3);
    expect(summary.failed).toBe(0);
    expect(summary.errored).toBe(0);
  });

  it('blocks destructive methods (POST, PUT, PATCH, DELETE) when allowDestructive is not set', async () => {
    const spec: TestSpecification = {
      version: '1.0.0',
      name: 'Blocked Mutations Suite',
      tests: [
        {
          id: 'post-user',
          name: 'POST user',
          request: { method: 'POST', path: '/users', body: { name: 'Bob' } },
          expect: { status: 201 },
        },
      ],
    };

    const runner = new SuiteRunner();
    const summary = await runner.runSuite(spec, { baseUrl, allowDestructive: false });

    expect(summary.errored).toBe(1);
    expect(summary.results[0]?.error?.code).toBe('GUARD_VIOLATION');
    expect(summary.results[0]?.error?.message).toContain(
      'Destructive HTTP method "POST" is blocked',
    );
  });

  it('executes destructive methods (POST, PUT, PATCH, DELETE) when allowDestructive is enabled', async () => {
    const spec: TestSpecification = {
      version: '1.0.0',
      name: 'Allowed Mutations Suite',
      tests: [
        {
          id: 'post-user',
          name: 'POST user creation',
          request: {
            method: 'POST',
            path: '/users',
            body: { name: 'Bob', role: 'developer' },
          },
          expect: {
            status: 201,
            hasProperties: ['id'],
            exact: { 'received.name': 'Bob' },
          },
        },
        {
          id: 'put-user',
          name: 'PUT user update',
          request: {
            method: 'PUT',
            path: '/users/1',
            body: { name: 'Bob Updated' },
          },
          expect: {
            status: 200,
            exact: { updated: true },
          },
        },
        {
          id: 'patch-user',
          name: 'PATCH user update',
          request: {
            method: 'PATCH',
            path: '/users/1',
            body: { patched: true },
          },
          expect: {
            status: 200,
            exact: { patched: true },
          },
        },
        {
          id: 'delete-user',
          name: 'DELETE user',
          request: {
            method: 'DELETE',
            path: '/users/1',
          },
          expect: {
            status: 204,
          },
        },
      ],
    };

    const runner = new SuiteRunner();
    const summary = await runner.runSuite(spec, { baseUrl, allowDestructive: true });

    expect(summary.total).toBe(4);
    expect(summary.passed).toBe(4);
    expect(summary.failed).toBe(0);
    expect(summary.errored).toBe(0);
  });
});
