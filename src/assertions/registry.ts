import type { HttpResponse } from '../http/types.js';
import type { ExpectationDefinition } from '../spec/types.js';
import { assertArray } from './array.js';
import { assertContentType } from './contentType.js';
import { assertHeaders } from './headers.js';
import { assertJsonFields } from './jsonFields.js';
import { assertJsonSchema } from './jsonSchema.js';
import { assertJsonValues } from './jsonValues.js';
import { assertMatches } from './matches.js';
import { assertNumeric } from './numeric.js';
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

  // 8. Regex Matches assertion
  const matchResults = assertMatches(response, expect.matches);
  results.push(...matchResults);

  // 9. Numeric comparisons
  const numericResults = assertNumeric(response, expect.numeric);
  results.push(...numericResults);

  // 10. Array assertions
  const arrayResults = assertArray(response, expect.array);
  results.push(...arrayResults);

  return results;
}
