import { describe, expect, it } from 'vitest';
import { RedactionRegistry } from '../../src/security/redaction.js';

describe('RedactionRegistry', () => {
  it('redacts sensitive headers automatically', () => {
    const registry = new RedactionRegistry();
    const headers = {
      Authorization: 'Bearer super-secret-jwt',
      'X-Api-Key': 'key-987654321',
      Cookie: 'session=xyz123',
      'Content-Type': 'application/json',
      Accept: '*/*',
    };

    const redacted = registry.redactHeaders(headers);
    expect(redacted['Authorization']).toBe('[REDACTED]');
    expect(redacted['X-Api-Key']).toBe('[REDACTED]');
    expect(redacted['Cookie']).toBe('[REDACTED]');
    expect(redacted['Content-Type']).toBe('application/json');
    expect(redacted['Accept']).toBe('*/*');
  });

  it('redacts sensitive query parameters from URLs', () => {
    const registry = new RedactionRegistry();
    const url = 'http://localhost:3000/api?token=secret123&api_key=mykey&page=2&search=test';
    const redacted = registry.redactUrl(url);

    expect(redacted).toContain('token=%5BREDACTED%5D');
    expect(redacted).toContain('api_key=%5BREDACTED%5D');
    expect(redacted).toContain('page=2');
    expect(redacted).toContain('search=test');
    expect(redacted).not.toContain('secret123');
    expect(redacted).not.toContain('mykey');
  });

  it('redacts registered custom secrets and bearer tokens from text', () => {
    const registry = new RedactionRegistry(['superSecretPassword42', 'corp_prod_token']);

    const text =
      'Failed to connect with corp_prod_token and password superSecretPassword42 or Bearer abcdef12345';
    const redacted = registry.redactText(text);

    expect(redacted).not.toContain('superSecretPassword42');
    expect(redacted).not.toContain('corp_prod_token');
    expect(redacted).not.toContain('Bearer abcdef12345');
    expect(redacted).toContain('Bearer [REDACTED]');
    expect(redacted).toContain('with [REDACTED] and password [REDACTED]');
  });

  it('redacts deeply nested objects and arrays', () => {
    const registry = new RedactionRegistry(['secret_val']);
    const obj = {
      user: {
        name: 'Alice',
        token: 'should-be-masked',
        details: ['secret_val', 'public_val'],
      },
      headers: {
        authorization: 'Bearer tok',
      },
    };

    const result = registry.redactDeep(obj);
    expect(result.user.name).toBe('Alice');
    expect(result.user.token).toBe('[REDACTED]');
    expect(result.user.details[0]).toBe('[REDACTED]');
    expect(result.user.details[1]).toBe('public_val');
    expect(result.headers.authorization).toBe('[REDACTED]');
  });
});
