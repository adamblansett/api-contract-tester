import type { RedirectPolicy } from '../config/defaults.js';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export interface RequestDefinition {
  method: HttpMethod;
  path: string;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | Array<string | number | boolean>>;
  body?: unknown;
  timeoutMs?: number;
  redirect?: RedirectPolicy;
}

export interface ExpectedHeaders {
  required?: Record<string, string> | string[];
  prohibited?: string[];
}

export interface ExpectationDefinition {
  status?: number | number[];
  headers?: ExpectedHeaders;
  contentType?: string;
  schema?: Record<string, unknown>;
  hasProperties?: string[];
  exact?: Record<string, unknown>;
  contains?: Record<string, unknown>;
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
}

export interface TestSpecification {
  version: string;
  name: string;
  description?: string;
  config?: SuiteConfig;
  tests: TestCase[];
}
