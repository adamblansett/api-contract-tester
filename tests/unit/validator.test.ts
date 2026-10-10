import { describe, expect, it } from 'vitest';
import { validateSpecification } from '../../src/spec/validator.js';

describe('Specification Validator', () => {
  const validSpec = {
    version: '1.0.0',
    name: 'Sample API Tests',
    config: {
      baseUrl: 'http://127.0.0.1:3000',
      timeoutMs: 5000,
    },
    tests: [
      {
        id: 'test-1',
        name: 'Health check',
        request: {
          method: 'GET',
          path: '/health',
        },
        expect: {
          status: 200,
        },
      },
    ],
  };

  it('validates a compliant specification', () => {
    const result = validateSpecification(validSpec);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.spec?.name).toBe('Sample API Tests');
  });

  it('rejects duplicate test IDs', () => {
    const duplicateSpec = {
      ...validSpec,
      tests: [
        {
          id: 'duplicate-id',
          name: 'First',
          request: { method: 'GET', path: '/first' },
          expect: { status: 200 },
        },
        {
          id: 'duplicate-id',
          name: 'Second',
          request: { method: 'GET', path: '/second' },
          expect: { status: 200 },
        },
      ],
    };

    const result = validateSpecification(duplicateSpec);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('Duplicate test ID'))).toBe(true);
  });

  it('rejects unsupported extra properties due to strict schema', () => {
    const invalidExtra = {
      ...validSpec,
      unsupportedExtraField: 'bad',
    };

    const result = validateSpecification(invalidExtra);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /unrecognized key/i.test(e.message))).toBe(true);
  });

  it('rejects absolute URLs in request paths during validation', () => {
    const badPathSpec = {
      ...validSpec,
      tests: [
        {
          id: 'test-abs',
          name: 'Absolute path test',
          request: {
            method: 'GET',
            path: 'https://evil.com/api',
          },
          expect: { status: 200 },
        },
      ],
    };

    const result = validateSpecification(badPathSpec);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('relative path'))).toBe(true);
  });

  it('rejects invalid JSON Schema definitions in expect block', () => {
    const badSchemaSpec = {
      ...validSpec,
      tests: [
        {
          id: 'test-schema-fail',
          name: 'Bad schema',
          request: { method: 'GET', path: '/items' },
          expect: {
            status: 200,
            schema: {
              type: 'invalid-type-name',
            },
          },
        },
      ],
    };

    const result = validateSpecification(badSchemaSpec);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('Invalid JSON Schema'))).toBe(true);
  });
});
