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
