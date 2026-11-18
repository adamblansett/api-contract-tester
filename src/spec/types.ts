import type { RedirectPolicy } from '../config/defaults.js';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export type StatusClass = '1xx' | '2xx' | '3xx' | '4xx' | '5xx';

export type ExpectedStatus = number | StatusClass | Array<number | StatusClass>;

export interface RetryConfig {
  maxAttempts: number;
  backoffMs?: number;
}

export interface RequestDefinition {
  method: HttpMethod;
  path: string;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | Array<string | number | boolean>>;
  body?: unknown;
  timeoutMs?: number;
  redirect?: RedirectPolicy;
  retry?: RetryConfig;
}

export interface ExpectedHeaders {
  required?: Record<string, string> | string[];
  prohibited?: string[];
}

export interface NumericExpectation {
  gt?: number;
  gte?: number;
  lt?: number;
  lte?: number;
  eq?: number;
}

export interface ArrayExpectation {
  length?: number;
  minItems?: number;
  maxItems?: number;
  isNotEmpty?: boolean;
}

export interface ExpectationDefinition {
  status?: ExpectedStatus;
  headers?: ExpectedHeaders;
  contentType?: string;
  schema?: Record<string, unknown>;
  hasProperties?: string[];
  exact?: Record<string, unknown>;
  contains?: Record<string, unknown>;
  matches?: Record<string, string>;
  numeric?: Record<string, NumericExpectation>;
  array?: Record<string, ArrayExpectation>;
  capture?: Record<string, string>;
  maxResponseTimeMs?: number;
}

export interface TestCase {
  id: string;
  name: string;
  description?: string;
  skip?: boolean;
  request: RequestDefinition;
  expect: ExpectationDefinition;
}

export interface SuiteConfig {
  baseUrl?: string;
  timeoutMs?: number;
  maxBodyBytes?: number;
  headers?: Record<string, string>;
  allowDestructive?: boolean;
  redirect?: RedirectPolicy;
  retry?: RetryConfig;
  blockPrivateNetworks?: boolean;
}

export interface TestSpecification {
  version: string;
  name: string;
  description?: string;
  config?: SuiteConfig;
  tests: TestCase[];
}
