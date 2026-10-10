import type { HttpResponse } from '../http/types.js';
import type { ExpectationDefinition } from '../spec/types.js';
import { assertContentType } from './contentType.js';
import { assertHeaders } from './headers.js';
import { assertJsonFields } from './jsonFields.js';
import { assertJsonSchema } from './jsonSchema.js';
import { assertJsonValues } from './jsonValues.js';
import { assertResponseTime } from './responseTime.js';
import { assertStatus } from './status.js';
import type { AssertionResult } from './types.js';

export function runAssertions(
  response: HttpResponse,
  expect: ExpectationDefinition,
): AssertionResult[] {
  const results: AssertionResult[] = [];

  // 1. Status assertion
  const statusRes = assertStatus(response, expect.status);
  if (statusRes) results.push(statusRes);

  // 2. Content-Type assertion
  const ctRes = assertContentType(response, expect.contentType);
  if (ctRes) results.push(ctRes);

  // 3. Headers assertion
  const headerResults = assertHeaders(response, expect.headers);
  results.push(...headerResults);

  // 4. Response Time assertion
  const timeRes = assertResponseTime(response, expect.maxResponseTimeMs);
  if (timeRes) results.push(timeRes);

  // 5. JSON Schema assertion
  const schemaRes = assertJsonSchema(response, expect.schema);
  if (schemaRes) results.push(schemaRes);

  // 6. JSON Fields assertion
  const fieldResults = assertJsonFields(response, expect.hasProperties);
  results.push(...fieldResults);

  // 7. JSON Values assertion
  const valueResults = assertJsonValues(response, expect.exact, expect.contains);
  results.push(...valueResults);

  return results;
}
