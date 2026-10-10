import { describe, expect, it } from 'vitest';
import { assertContentType } from '../../src/assertions/contentType.js';
import { assertHeaders } from '../../src/assertions/headers.js';
import { assertJsonFields } from '../../src/assertions/jsonFields.js';
import { assertJsonSchema } from '../../src/assertions/jsonSchema.js';
import { assertJsonValues } from '../../src/assertions/jsonValues.js';
import { assertResponseTime } from '../../src/assertions/responseTime.js';
import { assertStatus } from '../../src/assertions/status.js';
import type { HttpResponse } from '../../src/http/types.js';

describe('Assertion Implementations', () => {
  const baseResponse: HttpResponse = {
    status: 200,
    statusText: 'OK',
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'x-request-id': 'req-1234',
      'cache-control': 'no-store',
    },
    bodyText: JSON.stringify({
      id: 101,
      name: 'Alice',
      role: 'admin',
      tags: ['security', 'core'],
      profile: {
        email: 'alice@example.com',
        active: true,
      },
    }),
    bodyJson: {
      id: 101,
      name: 'Alice',
      role: 'admin',
      tags: ['security', 'core'],
      profile: {
        email: 'alice@example.com',
        active: true,
      },
    },
    responseTimeMs: 45,
    redirectCount: 0,
    finalUrl: 'http://127.0.0.1:3000/users/101',
  };

  it('asserts status code matching and array of accepted codes', () => {
    expect(assertStatus(baseResponse, 200)?.passed).toBe(true);
    expect(assertStatus(baseResponse, [200, 201, 204])?.passed).toBe(true);
    expect(assertStatus(baseResponse, 404)?.passed).toBe(false);
    expect(assertStatus(baseResponse, [400, 500])?.passed).toBe(false);
  });

  it('asserts headers required and prohibited', () => {
    const results = assertHeaders(baseResponse, {
      required: ['x-request-id', 'content-type'],
      prohibited: ['x-deprecated-header'],
    });

    expect(results).toHaveLength(3);
    expect(results.every((r) => r.passed)).toBe(true);

    const failResults = assertHeaders(baseResponse, {
      required: { 'x-request-id': 'wrong-id' },
      prohibited: ['x-request-id'],
    });
    expect(failResults.every((r) => !r.passed)).toBe(true);
  });

  it('asserts Content-Type', () => {
    expect(assertContentType(baseResponse, 'application/json')?.passed).toBe(true);
    expect(assertContentType(baseResponse, 'text/html')?.passed).toBe(false);
  });

  it('asserts JSON Schema validation with Ajv', () => {
    const validSchema = {
      type: 'object',
      properties: {
        id: { type: 'number' },
        name: { type: 'string' },
      },
      required: ['id', 'name'],
    };

    expect(assertJsonSchema(baseResponse, validSchema)?.passed).toBe(true);

    const failingSchema = {
      type: 'object',
      properties: {
        id: { type: 'string' }, // Expects string, but response id is number
      },
      required: ['id'],
    };

    const failResult = assertJsonSchema(baseResponse, failingSchema);
    expect(failResult?.passed).toBe(false);
    expect(failResult?.message).toContain('must be string');
  });

  it('asserts nested JSON field existence', () => {
    const results = assertJsonFields(baseResponse, [
      'id',
      'profile.email',
      'tags[0]',
      'profile.active',
    ]);
    expect(results.every((r) => r.passed)).toBe(true);

    const missing = assertJsonFields(baseResponse, ['profile.missing', 'nonexistent[99]']);
    expect(missing.every((r) => !r.passed)).toBe(true);
  });

  it('asserts exact and partial values', () => {
    const exactResults = assertJsonValues(baseResponse, {
      'profile.email': 'alice@example.com',
      role: 'admin',
    });
    expect(exactResults.every((r) => r.passed)).toBe(true);

    const partialResults = assertJsonValues(baseResponse, undefined, {
      profile: { active: true },
      tags: ['security'],
    });
    expect(partialResults.every((r) => r.passed)).toBe(true);
  });

  it('asserts response time thresholds', () => {
    expect(assertResponseTime(baseResponse, 100)?.passed).toBe(true);
    expect(assertResponseTime(baseResponse, 20)?.passed).toBe(false);
  });
});
