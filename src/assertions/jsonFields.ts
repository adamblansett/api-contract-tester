import type { HttpResponse } from '../http/types.js';
import { getNestedProperty } from './pathUtils.js';
import type { AssertionResult } from './types.js';

export function assertJsonFields(
  response: HttpResponse,
  hasProperties?: string[],
): AssertionResult[] {
  if (!hasProperties || hasProperties.length === 0) {
    return [];
  }

  if (response.bodyJson === undefined) {
    return [
      {
        name: 'JSON Property Existence',
        passed: false,
        message: 'Response body is not valid JSON; cannot evaluate required properties',
        expected: hasProperties,
        actual: undefined,
      },
    ];
  }

  const results: AssertionResult[] = [];

  for (const path of hasProperties) {
    const { found, value } = getNestedProperty(response.bodyJson, path);
    results.push({
      name: `Field Exists: ${path}`,
      passed: found,
      message: found
        ? `Property "${path}" exists in JSON response`
        : `Required property "${path}" not found in JSON response`,
      expected: `Presence of "${path}"`,
      actual: found ? value : 'undefined',
    });
  }

  return results;
}
