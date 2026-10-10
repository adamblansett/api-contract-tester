import type { HttpResponse } from '../http/types.js';
import { getNestedProperty } from './pathUtils.js';
import type { AssertionResult } from './types.js';

function isDeepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null || typeof a !== 'object') return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, idx) => isDeepEqual(item, b[idx]));
  }

  if (Array.isArray(a) || Array.isArray(b)) return false;

  const keysA = Object.keys(a as Record<string, unknown>);
  const keysB = Object.keys(b as Record<string, unknown>);
  if (keysA.length !== keysB.length) return false;

  return keysA.every((k) =>
    isDeepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
}

function isPartialMatch(actual: unknown, expected: unknown): boolean {
  if (actual === expected) return true;
  if (isDeepEqual(actual, expected)) return true;

  if (typeof actual === 'string' && typeof expected === 'string') {
    return actual.includes(expected);
  }

  if (Array.isArray(actual) && Array.isArray(expected)) {
    return expected.every((expItem) => actual.some((actItem) => isPartialMatch(actItem, expItem)));
  }

  if (
    actual !== null &&
    expected !== null &&
    typeof actual === 'object' &&
    typeof expected === 'object' &&
    !Array.isArray(actual) &&
    !Array.isArray(expected)
  ) {
    const actObj = actual as Record<string, unknown>;
    const expObj = expected as Record<string, unknown>;
    return Object.keys(expObj).every(
      (k) =>
        Object.prototype.hasOwnProperty.call(actObj, k) && isPartialMatch(actObj[k], expObj[k]),
    );
  }

  return false;
}

export function assertJsonValues(
  response: HttpResponse,
  exact?: Record<string, unknown>,
  contains?: Record<string, unknown>,
): AssertionResult[] {
  const results: AssertionResult[] = [];

  if (!exact && !contains) {
    return results;
  }

  if (response.bodyJson === undefined) {
    if (exact) {
      results.push({
        name: 'Exact Values',
        passed: false,
        message: 'Response body is not valid JSON; cannot evaluate exact values',
        expected: exact,
        actual: undefined,
      });
    }
    if (contains) {
      results.push({
        name: 'Partial Values',
        passed: false,
        message: 'Response body is not valid JSON; cannot evaluate partial values',
        expected: contains,
        actual: undefined,
      });
    }
    return results;
  }

  // Exact assertions
  if (exact) {
    for (const [path, expectedValue] of Object.entries(exact)) {
      const { found, value: actualValue } = getNestedProperty(response.bodyJson, path);
      const passed = found && isDeepEqual(actualValue, expectedValue);

      results.push({
        name: `Exact Value: ${path}`,
        passed,
        message: passed
          ? `Field "${path}" exactly matches expected value`
          : found
            ? `Field "${path}" expected ${JSON.stringify(expectedValue)}, received ${JSON.stringify(actualValue)}`
            : `Field "${path}" not found in response`,
        expected: expectedValue,
        actual: found ? actualValue : undefined,
      });
    }
  }

  // Contains / partial assertions
  if (contains) {
    for (const [path, expectedValue] of Object.entries(contains)) {
      const { found, value: actualValue } = getNestedProperty(response.bodyJson, path);
      const passed = found && isPartialMatch(actualValue, expectedValue);

      results.push({
        name: `Partial Match: ${path}`,
        passed,
        message: passed
          ? `Field "${path}" satisfies partial/containment check`
          : found
            ? `Field "${path}" expected to contain ${JSON.stringify(expectedValue)}, received ${JSON.stringify(actualValue)}`
            : `Field "${path}" not found in response`,
        expected: expectedValue,
        actual: found ? actualValue : undefined,
      });
    }
  }

  return results;
}
