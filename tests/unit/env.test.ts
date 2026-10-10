import { describe, expect, it } from 'vitest';
import { substituteEnvInValue, substituteString } from '../../src/spec/env.js';

describe('Environment Variable Substitution', () => {
  const env = {
    API_PORT: '8080',
    API_KEY: 'secret-token-xyz',
    USER_ID: 'user-42',
  };

  it('substitutes single and multiple variables in strings', () => {
    const { text, secretValues } = substituteString(
      'http://127.0.0.1:${API_PORT}/users/${USER_ID}',
      env,
    );
    expect(text).toBe('http://127.0.0.1:8080/users/user-42');
    expect(secretValues).toContain('8080');
    expect(secretValues).toContain('user-42');
  });

  it('handles default values when variable is not set', () => {
    const { text } = substituteString('Path: ${MISSING_VAR:-default_val}', env);
    expect(text).toBe('Path: default_val');
  });

  it('substitutes recursively across objects and collects secrets for redaction', () => {
    const input = {
      path: '/items/${USER_ID}',
      headers: {
        Authorization: 'Bearer ${API_KEY}',
      },
      tags: ['tag-${API_PORT}'],
    };

    const { result, substitutedSecrets } = substituteEnvInValue(input, env);

    expect(result.path).toBe('/items/user-42');
    expect(result.headers.Authorization).toBe('Bearer secret-token-xyz');
    expect(result.tags[0]).toBe('tag-8080');
    expect(substitutedSecrets).toContain('secret-token-xyz');
  });
});
