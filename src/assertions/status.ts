import type { HttpResponse } from '../http/types.js';
import type { AssertionResult } from './types.js';

export function assertStatus(
  response: HttpResponse,
  expectedStatus?: number | number[],
): AssertionResult | null {
  if (expectedStatus === undefined) {
    return null;
  }

  if (Array.isArray(expectedStatus)) {
    const passed = expectedStatus.includes(response.status);
    return {
      name: 'Status Code',
      passed,
      message: passed
        ? `Status ${response.status} is one of [${expectedStatus.join(', ')}]`
        : `Expected status to be one of [${expectedStatus.join(', ')}], received ${response.status}`,
      expected: expectedStatus,
      actual: response.status,
    };
  }

  const passed = response.status === expectedStatus;
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
