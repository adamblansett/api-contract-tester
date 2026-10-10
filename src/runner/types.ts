import type { AssertionResult } from '../assertions/types.js';
import type { ExitCode } from '../config/exitCodes.js';
import type { RedirectPolicy } from '../config/defaults.js';
import type { HttpMethod } from '../spec/types.js';

export type TestStatus = 'PASSED' | 'FAILED' | 'SKIPPED' | 'ERROR';

export interface ExecutedRequestSummary {
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
}

export interface ExecutedResponseSummary {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  responseTimeMs: number;
  bodyPreview?: string;
}

export interface TestExecutionResult {
  id: string;
  name: string;
  status: TestStatus;
  durationMs: number;
  request: ExecutedRequestSummary;
  response?: ExecutedResponseSummary;
  assertions: AssertionResult[];
  error?: {
    message: string;
    isTransport?: boolean;
    isTimeout?: boolean;
    code?: string;
  };
}

export interface SuiteRunSummary {
  specName: string;
  specVersion: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  errored: number;
  durationMs: number;
  exitCode: ExitCode;
  results: TestExecutionResult[];
}

export interface RunnerOptions {
  baseUrl?: string;
  concurrency?: number;
  timeoutMs?: number;
  allowDestructive?: boolean;
  maxBodyBytes?: number;
  redirect?: RedirectPolicy;
  env?: Record<string, string | undefined>;
}
