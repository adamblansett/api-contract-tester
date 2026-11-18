import type { HttpMethod } from '../spec/types.js';

export class DestructiveMethodBlockedError extends Error {
  public readonly method: HttpMethod;
  constructor(method: HttpMethod) {
    super(
      `Destructive HTTP method "${method}" is blocked by default safety controls. Pass --allow-destructive or set config.allowDestructive to true to execute mutation requests.`,
    );
    this.name = 'DestructiveMethodBlockedError';
    this.method = method;
  }
}

export class PayloadLimitExceededError extends Error {
  public readonly bytesReceived: number;
  public readonly maxBytes: number;
  constructor(bytesReceived: number, maxBytes: number) {
    super(
      `Response body size limit exceeded: received ${bytesReceived} bytes, maximum allowed is ${maxBytes} bytes.`,
    );
    this.name = 'PayloadLimitExceededError';
    this.bytesReceived = bytesReceived;
    this.maxBytes = maxBytes;
  }
}

export class HeaderSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HeaderSecurityError';
  }
}

const DESTRUCTIVE_METHODS = new Set<HttpMethod>(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Checks whether an HTTP method is considered destructive.
 */
export function isDestructiveMethod(method: HttpMethod): boolean {
  return DESTRUCTIVE_METHODS.has(method);
}

/**
 * Asserts that the HTTP method is allowed under the current execution policy.
 */
export function assertMethodAllowed(method: HttpMethod, allowDestructive: boolean): void {
  if (isDestructiveMethod(method) && !allowDestructive) {
    throw new DestructiveMethodBlockedError(method);
  }
}

const FORBIDDEN_HEADER_NAMES = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Asserts that HTTP request headers comply with RFC 9110 token rules and do not contain
 * carriage returns, line feeds, null bytes, or prototype pollution vectors (CRLF injection prevention).
 */
export function assertValidHeaders(headers: Record<string, string>): void {
  if (headers && typeof headers === 'object') {
    const proto = Object.getPrototypeOf(headers);
    if (proto !== Object.prototype && proto !== null) {
      throw new HeaderSecurityError(
        'Headers object has an invalid or tampered prototype (prototype pollution vector)',
      );
    }
  }

  if (Object.prototype.hasOwnProperty.call(headers, '__proto__')) {
    throw new HeaderSecurityError(
      'Header name "__proto__" is prohibited (prototype pollution vector)',
    );
  }

  for (const [key, value] of Object.entries(headers)) {
    if (!key || typeof key !== 'string') {
      throw new HeaderSecurityError('Header name must be a non-empty string');
    }
    const lower = key.toLowerCase();
    if (FORBIDDEN_HEADER_NAMES.has(lower)) {
      throw new HeaderSecurityError(
        `Header name "${key}" is prohibited (prototype pollution vector)`,
      );
    }
    if (!/^[a-zA-Z0-9!#$%&'*+\-.^_`|~]+$/.test(key)) {
      throw new HeaderSecurityError(
        `Header name "${key}" contains invalid characters or CRLF (must conform to RFC 9110 field-name tokens)`,
      );
    }
    if (typeof value !== 'string') {
      throw new HeaderSecurityError(`Header "${key}" value must be a string`);
    }
    if (/[\r\n\0]/.test(value)) {
      throw new HeaderSecurityError(
        `Header "${key}" value contains CRLF or null bytes, which is prohibited to prevent HTTP header injection`,
      );
    }
  }
}
