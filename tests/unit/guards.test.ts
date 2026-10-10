import { describe, expect, it } from 'vitest';
import {
  assertMethodAllowed,
  DestructiveMethodBlockedError,
  isDestructiveMethod,
} from '../../src/security/guards.js';

describe('Security Guards', () => {
  it('correctly classifies destructive and safe HTTP methods', () => {
    expect(isDestructiveMethod('GET')).toBe(false);
    expect(isDestructiveMethod('HEAD')).toBe(false);
    expect(isDestructiveMethod('OPTIONS')).toBe(false);

    expect(isDestructiveMethod('POST')).toBe(true);
    expect(isDestructiveMethod('PUT')).toBe(true);
    expect(isDestructiveMethod('PATCH')).toBe(true);
    expect(isDestructiveMethod('DELETE')).toBe(true);
  });

  it('blocks destructive methods when allowDestructive is false', () => {
    expect(() => assertMethodAllowed('POST', false)).toThrow(DestructiveMethodBlockedError);
    expect(() => assertMethodAllowed('PUT', false)).toThrow(DestructiveMethodBlockedError);
    expect(() => assertMethodAllowed('PATCH', false)).toThrow(DestructiveMethodBlockedError);
    expect(() => assertMethodAllowed('DELETE', false)).toThrow(DestructiveMethodBlockedError);

    // Safe methods pass
    expect(() => assertMethodAllowed('GET', false)).not.toThrow();
    expect(() => assertMethodAllowed('HEAD', false)).not.toThrow();
    expect(() => assertMethodAllowed('OPTIONS', false)).not.toThrow();
  });

  it('permits destructive methods when allowDestructive is true', () => {
    expect(() => assertMethodAllowed('POST', true)).not.toThrow();
    expect(() => assertMethodAllowed('PUT', true)).not.toThrow();
    expect(() => assertMethodAllowed('PATCH', true)).not.toThrow();
    expect(() => assertMethodAllowed('DELETE', true)).not.toThrow();
  });
});
