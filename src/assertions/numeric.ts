import type { HttpResponse } from '../http/types.js';
import type { NumericExpectation } from '../spec/types.js';
import { resolveResponseValue } from './pathUtils.js';
import type { AssertionResult } from './types.js';

export function assertNumeric(
  response: HttpResponse,
  numeric?: Record<string, NumericExpectation>,
): AssertionResult[] {
  if (!numeric || Object.keys(numeric).length === 0) {
    return [];
  }

  const results: AssertionResult[] = [];

  for (const [path, rules] of Object.entries(numeric)) {
    const { found, value } = resolveResponseValue(response, path);

    if (!found) {
      results.push({
        name: `Numeric Comparison: ${path}`,
        passed: false,
        message: `Field or header "${path}" was not found in response`,
        expected: rules,
        actual: undefined,
      });
      continue;
    }

    const numValue = typeof value === 'number' ? value : Number(value);
    if (isNaN(numValue)) {
      results.push({
        name: `Numeric Comparison: ${path}`,
        passed: false,
        message: `Field "${path}" value (${JSON.stringify(value)}) is not a valid number`,
        expected: rules,
        actual: value,
      });
      continue;
    }

    const failures: string[] = [];

    if (rules.gt !== undefined && !(numValue > rules.gt)) {
      failures.push(`expected > ${rules.gt}, received ${numValue}`);
    }
    if (rules.gte !== undefined && !(numValue >= rules.gte)) {
      failures.push(`expected >= ${rules.gte}, received ${numValue}`);
    }
    if (rules.lt !== undefined && !(numValue < rules.lt)) {
      failures.push(`expected < ${rules.lt}, received ${numValue}`);
    }
    if (rules.lte !== undefined && !(numValue <= rules.lte)) {
      failures.push(`expected <= ${rules.lte}, received ${numValue}`);
    }
    if (rules.eq !== undefined && !(numValue === rules.eq)) {
      failures.push(`expected === ${rules.eq}, received ${numValue}`);
    }

    const passed = failures.length === 0;

    results.push({
      name: `Numeric Comparison: ${path}`,
      passed,
      message: passed
        ? `Field "${path}" satisfies numeric criteria (${numValue})`
        : `Field "${path}" failed numeric criteria: ${failures.join('; ')}`,
      expected: rules,
      actual: numValue,
    });
  }

  return results;
}
