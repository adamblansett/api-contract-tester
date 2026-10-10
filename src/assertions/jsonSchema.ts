import { Ajv, type ErrorObject, type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import type { HttpResponse } from '../http/types.js';
import type { AssertionResult } from './types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AjvClass: any = (Ajv as any).default ?? Ajv;
const ajv: Ajv = new AjvClass({ allErrors: true, strict: false });
// @ts-expect-error ajv-formats typing compatibility
addFormats(ajv);

export function assertJsonSchema(
  response: HttpResponse,
  schema?: Record<string, unknown>,
): AssertionResult | null {
  if (!schema) {
    return null;
  }

  if (response.bodyJson === undefined) {
    return {
      name: 'JSON Schema Validation',
      passed: false,
      message: 'Response body is empty or not valid JSON; cannot validate against JSON Schema',
      expected: schema,
      actual: response.bodyText.slice(0, 100),
    };
  }

  let validateFn: ValidateFunction;
  try {
    validateFn = ajv.compile(schema);
  } catch (err) {
    return {
      name: 'JSON Schema Compilation',
      passed: false,
      message: `Invalid schema definition: ${err instanceof Error ? err.message : String(err)}`,
      expected: schema,
      actual: undefined,
    };
  }

  const valid = validateFn(response.bodyJson);
  if (valid) {
    return {
      name: 'JSON Schema Validation',
      passed: true,
      message: 'Response body conforms to JSON Schema',
      expected: 'Valid according to schema',
      actual: 'Valid',
    };
  }

  const errorMessages = (validateFn.errors || []).map((err: ErrorObject) => {
    const propPath = err.instancePath ? `"${err.instancePath}"` : 'root';
    return `${propPath} ${err.message}`;
  });

  return {
    name: 'JSON Schema Validation',
    passed: false,
    message: `JSON Schema validation failed: ${errorMessages.join('; ')}`,
    expected: schema,
    actual: response.bodyJson,
  };
}
