// Configuration
export { ExitCode } from './config/exitCodes.js';
export { DEFAULTS, type RedirectPolicy } from './config/defaults.js';

// Specification & Schema
export {
  type TestSpecification,
  type TestCase,
  type RequestDefinition,
  type ExpectationDefinition,
  type ExpectedHeaders,
  type SuiteConfig,
  type HttpMethod,
} from './spec/types.js';
export {
  TestSpecificationSchema,
  TestCaseSchema,
  RequestDefinitionSchema,
  ExpectationDefinitionSchema,
} from './spec/schema.js';
export {
  validateSpecification,
  type SpecValidationResult,
  type SpecValidationError,
} from './spec/validator.js';
export { substituteString, substituteEnvInValue } from './spec/env.js';

// Security
export { validateBaseUrl, resolveSafeUrl, SecurityUrlError } from './security/url.js';
export { RedactionRegistry } from './security/redaction.js';
export {
  assertMethodAllowed,
  isDestructiveMethod,
  DestructiveMethodBlockedError,
  PayloadLimitExceededError,
} from './security/guards.js';

// HTTP
export { HttpClient } from './http/client.js';
export { type HttpRequest, type HttpResponse, TransportError } from './http/types.js';
export { validateRedirectTarget, RedirectSecurityError } from './http/redirects.js';

// Assertions
export { runAssertions } from './assertions/registry.js';
export { type AssertionResult } from './assertions/types.js';
export { assertStatus } from './assertions/status.js';
export { assertHeaders } from './assertions/headers.js';
export { assertContentType } from './assertions/contentType.js';
export { assertJsonSchema } from './assertions/jsonSchema.js';
export { assertJsonFields } from './assertions/jsonFields.js';
export { assertJsonValues } from './assertions/jsonValues.js';
export { assertResponseTime } from './assertions/responseTime.js';
export { getNestedProperty } from './assertions/pathUtils.js';

// Runner
export { SuiteRunner } from './runner/suiteRunner.js';
export { TestExecutor } from './runner/executor.js';
export {
  type RunnerOptions,
  type SuiteRunSummary,
  type TestExecutionResult,
  type TestStatus,
  type ExecutedRequestSummary,
  type ExecutedResponseSummary,
} from './runner/types.js';

// Reporters
export { TerminalReporter } from './reporters/terminal.js';
export { JsonReporter } from './reporters/json.js';
export { type Reporter, type ReporterOptions } from './reporters/types.js';
