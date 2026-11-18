import type { HttpResponse } from '../http/types.js';

export interface PathLookupResult {
  found: boolean;
  value: unknown;
}

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Safely resolves a nested property path (e.g., 'user.profile.name' or 'items[0].id')
 * against an unknown object without prototype access vulnerabilities.
 */
export function getNestedProperty(target: unknown, path: string): PathLookupResult {
  if (target === null || target === undefined || typeof path !== 'string' || path.length === 0) {
    return { found: false, value: undefined };
  }

  // Parse path tokens: handles dots and bracket indices like "items[0].name"
  const tokens: string[] = [];
  const regex = /[^.[\]]+|\[(\d+)\]/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(path)) !== null) {
    const token = match[1] ?? match[0];
    if (FORBIDDEN_KEYS.has(token)) {
      return { found: false, value: undefined };
    }
    tokens.push(token);
  }

  let current: unknown = target;

  for (const token of tokens) {
    if (current === null || current === undefined) {
      return { found: false, value: undefined };
    }

    if (Array.isArray(current)) {
      const index = parseInt(token, 10);
      if (isNaN(index) || index < 0 || index >= current.length) {
        return { found: false, value: undefined };
      }
      current = current[index];
    } else if (typeof current === 'object') {
      if (!Object.prototype.hasOwnProperty.call(current, token)) {
        return { found: false, value: undefined };
      }
      current = (current as Record<string, unknown>)[token];
    } else {
      return { found: false, value: undefined };
    }
  }

  return { found: true, value: current };
}

/**
 * Resolves a property path targeting either response headers or the parsed JSON body.
 * Supports:
 *  - "headers['content-type']" or "headers.etag" -> response headers
 *  - "body.user.id" or "user.id" -> response.bodyJson
 *  - "body" -> response.bodyJson or response.bodyText
 */
export function resolveResponseValue(response: HttpResponse, path: string): PathLookupResult {
  if (!path || typeof path !== 'string') {
    return { found: false, value: undefined };
  }

  const trimmed = path.trim();

  // Check headers lookup
  const headerMatch = trimmed.match(/^headers(?:\[['"](.+?)['"]\]|\.([a-zA-Z0-9_-]+))/i);
  if (headerMatch) {
    const headerName = (headerMatch[1] ?? headerMatch[2])?.toLowerCase();
    if (!headerName || FORBIDDEN_KEYS.has(headerName)) return { found: false, value: undefined };
    const hasHeader = Object.prototype.hasOwnProperty.call(response.headers, headerName);
    return { found: hasHeader, value: response.headers[headerName] };
  }

  if (trimmed === 'body') {
    return { found: true, value: response.bodyJson ?? response.bodyText };
  }

  if (trimmed.startsWith('body.')) {
    return getNestedProperty(response.bodyJson, trimmed.slice(5));
  }

  return getNestedProperty(response.bodyJson, trimmed);
}
