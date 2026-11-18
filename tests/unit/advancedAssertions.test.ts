import { describe, expect, it } from 'vitest';
import { assertArray } from '../../src/assertions/array.js';
import { assertMatches } from '../../src/assertions/matches.js';
import { assertNumeric } from '../../src/assertions/numeric.js';
import { assertStatus } from '../../src/assertions/status.js';
import type { HttpResponse } from '../../src/http/types.js';

describe('Advanced Assertions Unit Tests', () => {
  const sampleResponse: HttpResponse = {
    status: 201,
    statusText: 'Created',
    headers: {
      'content-type': 'application/json',
      etag: 'W/"abc12345"',
      'x-request-id': 'req-98765-xyz',
    },
    bodyText: JSON.stringify({
      id: 42,
      score: 95.5,
      email: 'dev@example.com',
      tags: ['alpha', 'beta', 'gamma'],
      emptyList: [],
    }),
    bodyJson: {
      id: 42,
      score: 95.5,
      email: 'dev@example.com',
      tags: ['alpha', 'beta', 'gamma'],
      emptyList: [],
    },
    responseTimeMs: 45,
    redirectCount: 0,
    finalUrl: 'http://127.0.0.1:3000/items',
  };

  describe('Status Classes', () => {
    it('matches 2xx status class against 201', () => {
      const res = assertStatus(sampleResponse, '2xx');
      expect(res).not.toBeNull();
      expect(res?.passed).toBe(true);
    });

    it('fails when status does not match class', () => {
      const res = assertStatus(sampleResponse, '4xx');
      expect(res).not.toBeNull();
      expect(res?.passed).toBe(false);
      expect(res?.message).toContain('Expected status 4xx, received 201');
    });

    it('matches status array with mixed codes and status classes', () => {
      const res1 = assertStatus(sampleResponse, [200, '2xx']);
      expect(res1?.passed).toBe(true);

      const res2 = assertStatus(sampleResponse, [400, '5xx']);
      expect(res2?.passed).toBe(false);
    });
  });

  describe('Regex Matches Assertion', () => {
    it('matches string patterns on headers and body properties', () => {
      const results = assertMatches(sampleResponse, {
        "headers['etag']": '^W/"[a-z0-9]+"$',
        'headers.x-request-id': '^req-\\d+-[a-z]+$',
        'body.email': '^[^@]+@[^@]+\\.[a-z]+$',
      });

      expect(results.length).toBe(3);
      expect(results.every((r) => r.passed)).toBe(true);
    });

    it('fails when regex pattern does not match value', () => {
      const results = assertMatches(sampleResponse, {
        'body.email': '^admin@.*$',
      });

      expect(results.length).toBe(1);
      expect(results[0]?.passed).toBe(false);
      expect(results[0]?.message).toContain('does not match pattern');
    });

    it('fails cleanly when target field does not exist', () => {
      const results = assertMatches(sampleResponse, {
        'body.nonexistent': '^test$',
      });

      expect(results.length).toBe(1);
      expect(results[0]?.passed).toBe(false);
      expect(results[0]?.message).toContain('was not found');
    });
  });

  describe('Numeric Comparisons', () => {
    it('evaluates gt, gte, lt, lte, and eq criteria', () => {
      const results = assertNumeric(sampleResponse, {
        'body.id': { gt: 40, lte: 42, eq: 42 },
        'body.score': { gte: 90, lt: 100 },
      });

      expect(results.length).toBe(2);
      expect(results.every((r) => r.passed)).toBe(true);
    });

    it('fails when numeric comparison fails', () => {
      const results = assertNumeric(sampleResponse, {
        'body.score': { gte: 100 },
      });

      expect(results.length).toBe(1);
      expect(results[0]?.passed).toBe(false);
      expect(results[0]?.message).toContain('expected >= 100, received 95.5');
    });

    it('fails when target is not a number', () => {
      const results = assertNumeric(sampleResponse, {
        'body.email': { gt: 10 },
      });

      expect(results.length).toBe(1);
      expect(results[0]?.passed).toBe(false);
      expect(results[0]?.message).toContain('is not a valid number');
    });
  });

  describe('Array Assertions', () => {
    it('evaluates length, minItems, maxItems, and isNotEmpty', () => {
      const results = assertArray(sampleResponse, {
        'body.tags': { length: 3, minItems: 1, maxItems: 5, isNotEmpty: true },
        'body.emptyList': { length: 0, isNotEmpty: false },
      });

      expect(results.length).toBe(2);
      expect(results.every((r) => r.passed)).toBe(true);
    });

    it('fails when array fails isNotEmpty or length bounds', () => {
      const results = assertArray(sampleResponse, {
        'body.emptyList': { isNotEmpty: true },
        'body.tags': { maxItems: 2 },
      });

      expect(results.length).toBe(2);
      expect(results[0]?.passed).toBe(false);
      expect(results[0]?.message).toContain('expected non-empty array');
      expect(results[1]?.passed).toBe(false);
      expect(results[1]?.message).toContain('expected maxItems <= 2, received 3');
    });

    it('fails when target is not an array', () => {
      const results = assertArray(sampleResponse, {
        'body.email': { minItems: 1 },
      });

      expect(results.length).toBe(1);
      expect(results[0]?.passed).toBe(false);
      expect(results[0]?.message).toContain('is not an array');
    });
  });
});
