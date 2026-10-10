import { describe, expect, it } from 'vitest';
import { resolveSafeUrl, SecurityUrlError, validateBaseUrl } from '../../src/security/url.js';

describe('Adversarial URL Security Tests', () => {
  describe('Base URL Validation Hardening', () => {
    it('rejects base URLs with embedded credentials', () => {
      expect(() => validateBaseUrl('http://admin:secret123@127.0.0.1:3000')).toThrow(
        SecurityUrlError,
      );
      expect(() => validateBaseUrl('https://user@api.example.com')).toThrow(SecurityUrlError);
    });

    it('rejects base URLs containing null bytes', () => {
      expect(() => validateBaseUrl('http://127.0.0.1:3000\0evil')).toThrow(SecurityUrlError);
      expect(() => validateBaseUrl('http://127.0.0.1:3000%00evil')).toThrow(SecurityUrlError);
    });
  });

  describe('Path Resolution and Normalization Hardening', () => {
    const baseWithoutSlash = 'http://127.0.0.1:8080/api/v1';
    const baseWithSlash = 'http://127.0.0.1:8080/api/v1/';
    const baseRoot = 'http://127.0.0.1:8080';

    it('resolves paths consistently with and without trailing slash on base URL', () => {
      expect(resolveSafeUrl(baseWithoutSlash, '/users')).toBe('http://127.0.0.1:8080/api/v1/users');
      expect(resolveSafeUrl(baseWithoutSlash, 'users')).toBe('http://127.0.0.1:8080/api/v1/users');
      expect(resolveSafeUrl(baseWithSlash, '/users')).toBe('http://127.0.0.1:8080/api/v1/users');
      expect(resolveSafeUrl(baseWithSlash, 'users')).toBe('http://127.0.0.1:8080/api/v1/users');
      expect(resolveSafeUrl(baseRoot, '/users')).toBe('http://127.0.0.1:8080/users');
      expect(resolveSafeUrl(baseRoot, 'users')).toBe('http://127.0.0.1:8080/users');
    });

    it('blocks path traversal attempting to escape base URL path prefix', () => {
      expect(() => resolveSafeUrl(baseWithoutSlash, '../../admin')).toThrow(SecurityUrlError);
      expect(() => resolveSafeUrl(baseWithSlash, '../v2/items')).toThrow(SecurityUrlError);
      expect(() => resolveSafeUrl(baseWithoutSlash, '/../v2')).toThrow(SecurityUrlError);
    });

    it('rejects backslashes in request paths', () => {
      expect(() => resolveSafeUrl(baseRoot, '\\\\evil.com')).toThrow(SecurityUrlError);
      expect(() => resolveSafeUrl(baseRoot, '/\\evil.com')).toThrow(SecurityUrlError);
      expect(() => resolveSafeUrl(baseRoot, 'users\\admin')).toThrow(SecurityUrlError);
      expect(() => resolveSafeUrl(baseRoot, '..\\..\\etc\\passwd')).toThrow(SecurityUrlError);
    });

    it('rejects null bytes in request paths', () => {
      expect(() => resolveSafeUrl(baseRoot, '/users\0bypass')).toThrow(SecurityUrlError);
      expect(() => resolveSafeUrl(baseRoot, '/users%00bypass')).toThrow(SecurityUrlError);
    });

    it('rejects protocol-relative URLs in all forms', () => {
      expect(() => resolveSafeUrl(baseRoot, '//evil.com')).toThrow(SecurityUrlError);
      expect(() => resolveSafeUrl(baseRoot, '/\\evil.com')).toThrow(SecurityUrlError);
      expect(() => resolveSafeUrl(baseRoot, '\\/evil.com')).toThrow(SecurityUrlError);
    });

    it('rejects arbitrary schemes and pseudo-protocols', () => {
      expect(() => resolveSafeUrl(baseRoot, 'javascript:alert(1)')).toThrow(SecurityUrlError);
      expect(() => resolveSafeUrl(baseRoot, 'data:text/html,evil')).toThrow(SecurityUrlError);
      expect(() => resolveSafeUrl(baseRoot, 'http:evil.com')).toThrow(SecurityUrlError);
      expect(() => resolveSafeUrl(baseRoot, 'custom-proto://target')).toThrow(SecurityUrlError);
    });

    it('strips client-side fragment identifiers from resolved URL', () => {
      const resolved = resolveSafeUrl(baseRoot, '/items#details', { sort: 'desc' });
      expect(resolved).toBe('http://127.0.0.1:8080/items?sort=desc');
      expect(resolved).not.toContain('#');
    });

    it('merges path query strings with structured query parameters', () => {
      const resolved = resolveSafeUrl(baseRoot, '/search?category=books', { page: 2 });
      expect(resolved).toBe('http://127.0.0.1:8080/search?category=books&page=2');
    });
  });
});
