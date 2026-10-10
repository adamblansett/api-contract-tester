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
