import type { HttpResponse } from '../http/types.js';
import type { ArrayExpectation } from '../spec/types.js';
import { resolveResponseValue } from './pathUtils.js';
import type { AssertionResult } from './types.js';

export function assertArray(
  response: HttpResponse,
  arrayExpectations?: Record<string, ArrayExpectation>,
): AssertionResult[] {
  if (!arrayExpectations || Object.keys(arrayExpectations).length === 0) {
    return [];
  }

  const results: AssertionResult[] = [];

  for (const [path, rules] of Object.entries(arrayExpectations)) {
    const { found, value } = resolveResponseValue(response, path);

    if (!found) {
      results.push({
        name: `Array Assertion: ${path}`,
        passed: false,
        message: `Array field "${path}" was not found in response`,
        expected: rules,
        actual: undefined,
      });
      continue;
    }

    if (!Array.isArray(value)) {
      results.push({
        name: `Array Assertion: ${path}`,
        passed: false,
        message: `Field "${path}" is not an array (type: ${typeof value})`,
        expected: rules,
        actual: value,
      });
      continue;
    }

    const failures: string[] = [];

    if (rules.length !== undefined && value.length !== rules.length) {
      failures.push(`expected length ${rules.length}, received ${value.length}`);
    }
    if (rules.minItems !== undefined && value.length < rules.minItems) {
      failures.push(`expected minItems >= ${rules.minItems}, received ${value.length}`);
    }
    if (rules.maxItems !== undefined && value.length > rules.maxItems) {
      failures.push(`expected maxItems <= ${rules.maxItems}, received ${value.length}`);
    }
    if (rules.isNotEmpty === true && value.length === 0) {
      failures.push('expected non-empty array, received empty array');
    }

    const passed = failures.length === 0;

    results.push({
      name: `Array Assertion: ${path}`,
      passed,
      message: passed
        ? `Array "${path}" satisfies criteria (length: ${value.length})`
        : `Array "${path}" failed criteria: ${failures.join('; ')}`,
      expected: rules,
      actual: `length: ${value.length}`,
    });
  }

  return results;
}
