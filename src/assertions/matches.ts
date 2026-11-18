import type { HttpResponse } from '../http/types.js';
import { resolveResponseValue } from './pathUtils.js';
import type { AssertionResult } from './types.js';

export function assertMatches(
  response: HttpResponse,
  matches?: Record<string, string>,
): AssertionResult[] {
  if (!matches || Object.keys(matches).length === 0) {
    return [];
  }

  const results: AssertionResult[] = [];

  for (const [path, pattern] of Object.entries(matches)) {
    const { found, value } = resolveResponseValue(response, path);

    if (!found) {
      results.push({
        name: `Regex Match: ${path}`,
        passed: false,
        message: `Field or header "${path}" was not found in the response`,
        expected: pattern,
        actual: undefined,
      });
      continue;
    }

    if (value === null || value === undefined) {
      results.push({
        name: `Regex Match: ${path}`,
        passed: false,
        message: `Field or header "${path}" is null or undefined`,
        expected: pattern,
        actual: value,
      });
      continue;
    }

    let regex: RegExp;
    try {
      regex = new RegExp(pattern);
    } catch (err) {
      results.push({
        name: `Regex Match: ${path}`,
        passed: false,
        message: `Invalid regular expression pattern "${pattern}": ${err instanceof Error ? err.message : String(err)}`,
        expected: pattern,
        actual: value,
      });
      continue;
    }

    const strValue = typeof value === 'string' ? value : String(value);
    const passed = regex.test(strValue);

    results.push({
      name: `Regex Match: ${path}`,
      passed,
      message: passed
        ? `Field "${path}" matches pattern /${pattern}/`
        : `Field "${path}" value "${strValue}" does not match pattern /${pattern}/`,
      expected: pattern,
      actual: strValue,
    });
  }

  return results;
}
