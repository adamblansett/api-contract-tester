import type { HttpResponse } from '../http/types.js';
import type { ExpectedStatus, StatusClass } from '../spec/types.js';
import type { AssertionResult } from './types.js';

function matchesStatus(expected: number | StatusClass, actual: number): boolean {
  if (typeof expected === 'number') {
    return expected === actual;
  }
  const prefix = parseInt(expected.charAt(0), 10);
  if (isNaN(prefix)) return false;
  const min = prefix * 100;
  const max = min + 99;
  return actual >= min && actual <= max;
}

export function assertStatus(
  response: HttpResponse,
  expectedStatus?: ExpectedStatus,
): AssertionResult | null {
  if (expectedStatus === undefined) {
    return null;
  }

  if (Array.isArray(expectedStatus)) {
    const passed = expectedStatus.some((s) => matchesStatus(s, response.status));
    return {
      name: 'Status Code',
      passed,
      message: passed
        ? `Status ${response.status} matches expected [${expectedStatus.join(', ')}]`
        : `Expected status to match [${expectedStatus.join(', ')}], received ${response.status}`,
      expected: expectedStatus,
      actual: response.status,
    };
  }

  const passed = matchesStatus(expectedStatus, response.status);
  return {
    name: 'Status Code',
    passed,
    message: passed
      ? `Status matches expected ${expectedStatus}`
      : `Expected status ${expectedStatus}, received ${response.status}`,
    expected: expectedStatus,
    actual: response.status,
  };
}
