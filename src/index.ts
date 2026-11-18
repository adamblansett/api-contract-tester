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
  type ExpectedStatus,
  type StatusClass,
  type NumericExpectation,
  type ArrayExpectation,
  type RetryConfig,
  type SuiteConfig,
  type HttpMethod,
} from './spec/types.js';
export {
  TestSpecificationSchema,
  TestCaseSchema,
  RequestDefinitionSchema,
  ExpectationDefinitionSchema,
  RetryConfigSchema,
  NumericExpectationSchema,
  ArrayExpectationSchema,
  SuiteConfigSchema,
} from './spec/schema.js';
export {
  validateSpecification,
  type SpecValidationResult,
  type SpecValidationError,
} from './spec/validator.js';
export { substituteString, substituteEnvInValue } from './spec/env.js';

// Security
export { validateBaseUrl, resolveSafeUrl, SecurityUrlError } from './security/url.js';
export { isPrivateIPv4, isPrivateIPv6, assertPublicDestination } from './security/dns.js';
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
export { assertMatches } from './assertions/matches.js';
export { assertNumeric } from './assertions/numeric.js';
export { assertArray } from './assertions/array.js';
export { assertResponseTime } from './assertions/responseTime.js';
export { getNestedProperty, resolveResponseValue } from './assertions/pathUtils.js';

// Runner
export { SuiteRunner } from './runner/suiteRunner.js';
export { TestExecutor, buildCurlCommand } from './runner/executor.js';
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
export { JUnitReporter } from './reporters/junit.js';
export { formatGitHubSummary, emitGitHubAnnotations } from './reporters/github.js';
export { type Reporter, type ReporterOptions, type ReportFormat } from './reporters/types.js';

// Tooling & Commands
export { generateContractJsonSchema, runExportSchemaCommand } from './cli/commands/exportSchema.js';
export { runImportOpenApiCommand } from './cli/commands/importOpenApi.js';
export { runMockServerCommand } from './cli/commands/mock.js';
