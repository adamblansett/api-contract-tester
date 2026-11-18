import { performance } from 'node:perf_hooks';
import { resolveResponseValue } from '../assertions/pathUtils.js';
import { runAssertions } from '../assertions/registry.js';
import { DEFAULTS } from '../config/defaults.js';
import { HttpClient } from '../http/client.js';
import { type HttpRequest, type HttpResponse, TransportError } from '../http/types.js';
import { assertMethodAllowed, assertValidHeaders } from '../security/guards.js';
import { RedactionRegistry } from '../security/redaction.js';
import { resolveSafeUrl, SecurityUrlError } from '../security/url.js';
import { substituteEnvInValue, substituteString } from '../spec/env.js';
import type { TestCase, TestSpecification } from '../spec/types.js';
import type { RunnerOptions, TestExecutionResult } from './types.js';

export function buildCurlCommand(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: string,
): string {
  const parts: string[] = ['curl', '-s', '-S', '-X', method];
  for (const [key, val] of Object.entries(headers)) {
    parts.push('-H', `'${key}: ${val.replace(/'/g, "'\\''")}'`);
  }
  if (body && method !== 'GET' && method !== 'HEAD') {
    parts.push('-d', `'${body.replace(/'/g, "'\\''")}'`);
  }
  parts.push(`'${url}'`);
  return parts.join(' ');
}

export class TestExecutor {
  private httpClient: HttpClient;
  private redaction: RedactionRegistry;

  constructor(httpClient = new HttpClient(), redaction = new RedactionRegistry()) {
    this.httpClient = httpClient;
    this.redaction = redaction;
  }

  public getRedactionRegistry(): RedactionRegistry {
    return this.redaction;
  }

  public async executeTest(
    test: TestCase,
    spec: TestSpecification,
    options: RunnerOptions,
  ): Promise<TestExecutionResult> {
    const startTime = performance.now();

    // 1. Check if skipped or filtered out
    if (test.skip) {
      return {
        id: test.id,
        name: test.name,
        status: 'SKIPPED',
        durationMs: 0,
        request: {
          method: test.request.method,
          url: test.request.path,
          headers: {},
        },
        assertions: [],
      };
    }

    if (options.filter) {
      let filterRegex: RegExp;
      try {
        filterRegex = new RegExp(options.filter, 'i');
      } catch {
        filterRegex = new RegExp(options.filter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      }
      if (!filterRegex.test(test.id) && !filterRegex.test(test.name)) {
        return {
          id: test.id,
          name: test.name,
          status: 'SKIPPED',
          durationMs: 0,
          request: {
            method: test.request.method,
            url: test.request.path,
            headers: {},
          },
          assertions: [],
        };
      }
    }

    // 2. Resolve configurations
    const baseUrl = options.baseUrl ?? spec.config?.baseUrl;
    if (!baseUrl) {
      throw new Error(
        `No base URL provided. Specify --base-url in the CLI or "baseUrl" in specification config.`,
      );
    }

    const timeoutMs =
      test.request.timeoutMs ?? options.timeoutMs ?? spec.config?.timeoutMs ?? DEFAULTS.TIMEOUT_MS;

    const maxBodyBytes =
      options.maxBodyBytes ?? spec.config?.maxBodyBytes ?? DEFAULTS.MAX_BODY_BYTES;

    const allowDestructive =
      options.allowDestructive ?? spec.config?.allowDestructive ?? DEFAULTS.ALLOW_DESTRUCTIVE;

    const redirectPolicy =
      test.request.redirect ??
      options.redirect ??
      spec.config?.redirect ??
      DEFAULTS.REDIRECT_POLICY;

    const retryConfig = test.request.retry ?? spec.config?.retry;
    const blockPrivateNetworks =
      options.blockPrivateNetworks ?? spec.config?.blockPrivateNetworks ?? false;

    // 3. Security check: Destructive method guard
    try {
      assertMethodAllowed(test.request.method, allowDestructive);
    } catch (guardErr) {
      const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
      return {
        id: test.id,
        name: test.name,
        status: 'ERROR',
        durationMs,
        request: {
          method: test.request.method,
          url: test.request.path,
          headers: {},
        },
        assertions: [],
        error: {
          message: guardErr instanceof Error ? guardErr.message : String(guardErr),
          code: 'GUARD_VIOLATION',
        },
      };
    }

    // 4. Substitute environment and session variables
    const baseEnv = options.env ?? process.env;
    const cleanSessionVars: Record<string, string | undefined> = Object.create(null);
    if (options.sessionVariables) {
      for (const [k, v] of Object.entries(options.sessionVariables)) {
        if (!['__proto__', 'constructor', 'prototype'].includes(k.toLowerCase())) {
          cleanSessionVars[k] = v;
        }
      }
    }
    const combinedEnv: Record<string, string | undefined> = {
      ...baseEnv,
      ...cleanSessionVars,
    };

    const { text: subPath, secretValues: pathSecrets } = substituteString(
      test.request.path,
      combinedEnv,
    );
    this.redaction.addSecrets(pathSecrets);

    const { result: subQuery, substitutedSecrets: querySecrets } = substituteEnvInValue(
      test.request.query,
      combinedEnv,
    );
    this.redaction.addSecrets(querySecrets);

    // Merge default headers and test headers
    const rawHeaders: Record<string, string> = {
      ...(spec.config?.headers ?? {}),
      ...(test.request.headers ?? {}),
    };
    const { result: subHeaders, substitutedSecrets: headerSecrets } = substituteEnvInValue(
      rawHeaders,
      combinedEnv,
    );
    this.redaction.addSecrets(headerSecrets);

    // Security check: Validate header names and values (CRLF injection prevention)
    try {
      assertValidHeaders(subHeaders);
    } catch (headerErr) {
      const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
      return {
        id: test.id,
        name: test.name,
        status: 'ERROR',
        durationMs,
        request: {
          method: test.request.method,
          url: test.request.path,
          headers: {},
        },
        assertions: [],
        error: {
          message: headerErr instanceof Error ? headerErr.message : String(headerErr),
          code: 'GUARD_VIOLATION',
        },
      };
    }

    // Process and substitute body
    let requestBodyString: string | undefined;
    if (test.request.body !== undefined) {
      const { result: subBody, substitutedSecrets: bodySecrets } = substituteEnvInValue(
        test.request.body,
        combinedEnv,
      );
      this.redaction.addSecrets(bodySecrets);

      if (typeof subBody === 'string') {
        requestBodyString = subBody;
      } else {
        requestBodyString = JSON.stringify(subBody);
        // Automatically default content-type to application/json if not set
        const hasContentType = Object.keys(subHeaders).some(
          (k) => k.toLowerCase() === 'content-type',
        );
        if (!hasContentType) {
          subHeaders['Content-Type'] = 'application/json';
        }
      }
    }

    // 5. Safe URL resolution
    let targetUrl: string;
    try {
      targetUrl = resolveSafeUrl(baseUrl, subPath, subQuery);
    } catch (urlErr) {
      const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
      return {
        id: test.id,
        name: test.name,
        status: 'ERROR',
        durationMs,
        request: {
          method: test.request.method,
          url: test.request.path,
          headers: this.redaction.redactHeaders(subHeaders),
        },
        assertions: [],
        error: {
          message: urlErr instanceof Error ? urlErr.message : String(urlErr),
          code: urlErr instanceof SecurityUrlError ? 'SECURITY_URL_ERROR' : 'URL_ERROR',
        },
      };
    }

    // Dry-run / cURL preview mode
    if (options.dryRun) {
      const curlCmd = buildCurlCommand(
        test.request.method,
        targetUrl,
        this.redaction.redactHeaders(subHeaders),
        requestBodyString ? this.redaction.redactText(requestBodyString) : undefined,
      );

      const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
      return {
        id: test.id,
        name: test.name,
        status: 'PASSED',
        durationMs,
        request: {
          method: test.request.method,
          url: this.redaction.redactUrl(targetUrl),
          headers: this.redaction.redactHeaders(subHeaders),
        },
        curlPreview: curlCmd,
        assertions: [],
      };
    }

    const httpRequest: HttpRequest = {
      url: targetUrl,
      method: test.request.method,
      headers: subHeaders,
      body: requestBodyString,
      timeoutMs,
      redirect: redirectPolicy,
      maxBodyBytes,
      retry: retryConfig,
      blockPrivateNetworks,
    };

    // 6. Execute HTTP request
    let response: HttpResponse;
    try {
      response = await this.httpClient.execute(httpRequest);
    } catch (httpErr) {
      const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
      const isTransport = httpErr instanceof TransportError;
      const isTimeout = isTransport ? (httpErr as TransportError).isTimeout : false;
      const code = isTransport ? (httpErr as TransportError).code : undefined;
      const rawMessage = httpErr instanceof Error ? httpErr.message : String(httpErr);

      return {
        id: test.id,
        name: test.name,
        status: 'ERROR',
        durationMs,
        request: {
          method: test.request.method,
          url: this.redaction.redactUrl(targetUrl),
          headers: this.redaction.redactHeaders(subHeaders),
        },
        assertions: [],
        error: {
          message: this.redaction.redactText(rawMessage),
          isTransport: true,
          isTimeout,
          code,
        },
      };
    }

    // 7. Evaluate assertions
    const rawAssertionResults = runAssertions(response, test.expect);
    const allPassed = rawAssertionResults.every((a) => a.passed);
    const durationMs = Math.round((performance.now() - startTime) * 100) / 100;

    // Deeply redact all assertion diagnostic messages, expected, and actual values
    const assertionResults = this.redaction.redactDeep(rawAssertionResults);

    // 8. Capture variables for downstream tests if defined
    const captured: Record<string, string> = {};
    if (test.expect.capture && typeof test.expect.capture === 'object') {
      for (const [varName, capturePath] of Object.entries(test.expect.capture)) {
        const cleanName = varName.trim();
        if (
          !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(cleanName) ||
          ['__proto__', 'constructor', 'prototype'].includes(cleanName.toLowerCase())
        ) {
          continue;
        }
        const { found, value } = resolveResponseValue(response, capturePath);
        if (found && value !== undefined && value !== null) {
          const strVal = typeof value === 'string' ? value : JSON.stringify(value);
          captured[cleanName] = strVal;
          // Immediately register captured value in the redaction registry
          this.redaction.addSecret(strVal);
          if (options.sessionVariables) {
            options.sessionVariables[cleanName] = strVal;
          }
        }
      }
    }

    // Body preview for diagnostics on failure
    let bodyPreview: string | undefined;
    if (!allPassed && response.bodyText) {
      const truncated =
        response.bodyText.length > 500
          ? response.bodyText.slice(0, 500) + '... [truncated]'
          : response.bodyText;
      bodyPreview = this.redaction.redactText(truncated);
    }

    return {
      id: test.id,
      name: test.name,
      status: allPassed ? 'PASSED' : 'FAILED',
      durationMs,
      request: {
        method: test.request.method,
        url: this.redaction.redactUrl(targetUrl),
        headers: this.redaction.redactHeaders(subHeaders),
      },
      response: {
        status: response.status,
        statusText: response.statusText,
        headers: this.redaction.redactHeaders(response.headers),
        responseTimeMs: response.responseTimeMs,
        bodyPreview,
      },
      capturedVariables: Object.keys(captured).length > 0 ? captured : undefined,
      assertions: assertionResults,
    };
  }
}
