import { describe, expect, it } from 'vitest';
import { resolveSafeUrl, SecurityUrlError, validateBaseUrl } from '../../src/security/url.js';

describe('Base URL Validation', () => {
  it('accepts valid http and https URLs', () => {
    expect(validateBaseUrl('http://127.0.0.1:3000').origin).toBe('http://127.0.0.1:3000');
    expect(validateBaseUrl('https://api.example.com/v1').origin).toBe('https://api.example.com');
  });

  it('rejects disallowed protocols like file:, ftp:, javascript:', () => {
    expect(() => validateBaseUrl('file:///etc/passwd')).toThrow(SecurityUrlError);
    expect(() => validateBaseUrl('ftp://ftp.example.com')).toThrow(SecurityUrlError);
    expect(() => validateBaseUrl('javascript:alert(1)')).toThrow(SecurityUrlError);
    expect(() => validateBaseUrl('data:text/plain;base64,SGVsbG8=')).toThrow(SecurityUrlError);
  });

  it('rejects invalid URL strings and empty inputs', () => {
    expect(() => validateBaseUrl('')).toThrow(SecurityUrlError);
    expect(() => validateBaseUrl('not-a-url')).toThrow(SecurityUrlError);
  });
});

describe('Safe Relative URL Resolution', () => {
  const base = 'http://127.0.0.1:8080/api';

  it('resolves standard relative paths', () => {
    const resolved = resolveSafeUrl(base, '/users');
    expect(resolved).toBe('http://127.0.0.1:8080/api/users');

    const relativeSub = resolveSafeUrl(base, 'v2/items');
    expect(relativeSub).toBe('http://127.0.0.1:8080/api/v2/items');
  });

  it('appends query parameters cleanly', () => {
    const resolved = resolveSafeUrl(base, '/search', {
      q: 'contracts',
      limit: 10,
      filter: ['a', 'b'],
    });
    expect(resolved).toBe(
      'http://127.0.0.1:8080/api/search?q=contracts&limit=10&filter=a&filter=b',
    );
  });

  it('rejects absolute URLs in request paths by default', () => {
    expect(() => resolveSafeUrl(base, 'https://evil.com/hack')).toThrow(SecurityUrlError);
    expect(() => resolveSafeUrl(base, 'http://127.0.0.1:9090/other')).toThrow(SecurityUrlError);
  });

  it('rejects protocol-relative URLs', () => {
    expect(() => resolveSafeUrl(base, '//evil.com/exploit')).toThrow(SecurityUrlError);
  });

  it('rejects path traversal attempting cross-origin escapes', () => {
    expect(() => resolveSafeUrl(base, 'https://sub.127.0.0.1:8080')).toThrow(SecurityUrlError);
  });
});
