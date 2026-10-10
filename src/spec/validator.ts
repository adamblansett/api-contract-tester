import { Ajv } from 'ajv';
import addFormats from 'ajv-formats';
import { TestSpecificationSchema } from './schema.js';
import type { TestSpecification } from './types.js';

export interface SpecValidationError {
  path: string;
  message: string;
}

export interface SpecValidationResult {
  valid: boolean;
  spec?: TestSpecification;
  errors: SpecValidationError[];
}

// Reusable Ajv instance for validating JSON Schema definitions
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AjvClass: any = (Ajv as any).default ?? Ajv;
const ajv: Ajv = new AjvClass({ allErrors: true, strict: false });
// @ts-expect-error ajv-formats typing compatibility
addFormats(ajv);

/**
 * Validates an API test specification strictly against schema rules,
 * duplicate test IDs, and well-formed JSON Schema assertions.
 *
 * Guaranteed: NO network requests are executed.
 */
export function validateSpecification(input: unknown): SpecValidationResult {
  const errors: SpecValidationError[] = [];

  const parseResult = TestSpecificationSchema.safeParse(input);
  if (!parseResult.success) {
    for (const issue of parseResult.error.issues) {
      errors.push({
        path: issue.path.join('.'),
        message: issue.message,
      });
    }
    return { valid: false, errors };
  }

  const spec = parseResult.data as TestSpecification;

  // Check for duplicate test IDs
  const seenIds = new Set<string>();
  for (let i = 0; i < spec.tests.length; i++) {
    const test = spec.tests[i];
    if (!test) continue;

    if (seenIds.has(test.id)) {
      errors.push({
        path: `tests[${i}].id`,
        message: `Duplicate test ID "${test.id}". Each test ID must be unique within a specification.`,
      });
    } else {
      seenIds.add(test.id);
    }

    // Verify Ajv compilation if JSON Schema expectation is provided
    if (test.expect.schema) {
      try {
        ajv.compile(test.expect.schema);
      } catch (err) {
        errors.push({
          path: `tests[${i}].expect.schema`,
          message: `Invalid JSON Schema definition: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    spec: errors.length === 0 ? spec : undefined,
    errors,
  };
}
