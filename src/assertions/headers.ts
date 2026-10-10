import type { HttpResponse } from '../http/types.js';
import type { ExpectedHeaders } from '../spec/types.js';
import type { AssertionResult } from './types.js';

export function assertHeaders(
  response: HttpResponse,
  expectedHeaders?: ExpectedHeaders,
): AssertionResult[] {
  if (!expectedHeaders) {
    return [];
  }

  const results: AssertionResult[] = [];

  // Required headers
  if (expectedHeaders.required) {
    if (Array.isArray(expectedHeaders.required)) {
      for (const headerName of expectedHeaders.required) {
        const lower = headerName.toLowerCase();
        const exists = Object.prototype.hasOwnProperty.call(response.headers, lower);
        results.push({
          name: `Required Header: ${headerName}`,
          passed: exists,
          message: exists
            ? `Header "${headerName}" is present (value: "${response.headers[lower]}")`
            : `Required header "${headerName}" is missing from response`,
          expected: headerName,
          actual: exists ? response.headers[lower] : undefined,
        });
      }
    } else {
      for (const [headerName, expectedValue] of Object.entries(expectedHeaders.required)) {
        const lower = headerName.toLowerCase();
        const actualValue = response.headers[lower];
        const exists = actualValue !== undefined;
        const matches = exists && actualValue.toLowerCase() === expectedValue.toLowerCase();

        results.push({
          name: `Header Value: ${headerName}`,
          passed: matches,
          message: matches
            ? `Header "${headerName}" matches expected value "${expectedValue}"`
            : exists
              ? `Header "${headerName}" expected "${expectedValue}", received "${actualValue}"`
              : `Header "${headerName}" is missing from response (expected "${expectedValue}")`,
          expected: expectedValue,
          actual: actualValue,
        });
      }
    }
  }

  // Prohibited headers
  if (expectedHeaders.prohibited) {
    for (const headerName of expectedHeaders.prohibited) {
      const lower = headerName.toLowerCase();
      const exists = Object.prototype.hasOwnProperty.call(response.headers, lower);
      results.push({
        name: `Prohibited Header: ${headerName}`,
        passed: !exists,
        message: !exists
          ? `Prohibited header "${headerName}" is not present`
          : `Prohibited header "${headerName}" was found with value "${response.headers[lower]}"`,
        expected: `Omission of ${headerName}`,
        actual: exists ? response.headers[lower] : undefined,
      });
    }
  }

  return results;
}
