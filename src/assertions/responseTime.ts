import type { HttpResponse } from '../http/types.js';
import type { AssertionResult } from './types.js';

export function assertResponseTime(
  response: HttpResponse,
  maxResponseTimeMs?: number,
): AssertionResult | null {
  if (maxResponseTimeMs === undefined) {
    return null;
  }

  const passed = response.responseTimeMs <= maxResponseTimeMs;
  return {
    name: 'Response Time',
    passed,
    message: passed
      ? `Response received in ${response.responseTimeMs}ms (threshold: <= ${maxResponseTimeMs}ms)`
      : `Response time ${response.responseTimeMs}ms exceeded threshold of ${maxResponseTimeMs}ms`,
    expected: `<= ${maxResponseTimeMs}ms`,
    actual: `${response.responseTimeMs}ms`,
  };
}
