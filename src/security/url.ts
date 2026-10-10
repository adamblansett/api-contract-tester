export class SecurityUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityUrlError';
  }
}

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Validates and normalizes a base URL.
 * Only http and https protocols without embedded credentials are permitted.
 */
export function validateBaseUrl(rawUrl: string): URL {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new SecurityUrlError('Base URL must be a non-empty string');
  }

  if (rawUrl.includes('\0') || rawUrl.includes('%00')) {
    throw new SecurityUrlError('Base URL contains null bytes, which is prohibited');
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SecurityUrlError(`Invalid base URL: "${rawUrl}"`);
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new SecurityUrlError(
      `Disallowed protocol "${parsed.protocol}" in base URL. Only http: and https: are permitted.`,
    );
  }

  if (!parsed.hostname) {
    throw new SecurityUrlError(`Base URL missing valid hostname: "${rawUrl}"`);
  }

  // Reject embedded credentials in base URL
  if (parsed.username || parsed.password) {
    throw new SecurityUrlError(
      `Base URL must not contain embedded credentials (username/password): "${rawUrl}". Use Authorization headers or environment variables instead.`,
    );
  }

  return parsed;
}

/**
 * Resolves a relative path against a validated base URL.
 * Strictly prevents absolute URLs in individual test cases, protocol escapes,
 * backslash normalization bypasses, and cross-origin or path prefix escapes.
 */
export function resolveSafeUrl(
  base: string | URL,
  relativePath: string,
  query?: Record<string, string | number | boolean | Array<string | number | boolean>>,
): string {
  const baseUrl = typeof base === 'string' ? validateBaseUrl(base) : base;

  if (typeof relativePath !== 'string') {
    throw new SecurityUrlError('Request path must be a string');
  }

  // Reject null bytes
  if (relativePath.includes('\0') || relativePath.includes('%00')) {
    throw new SecurityUrlError('Request path contains null bytes, which is prohibited');
  }

  // Reject backslashes to avoid normalization / traversal bypasses
  if (relativePath.includes('\\')) {
    throw new SecurityUrlError(
      `Backslashes in request paths are prohibited for security reasons: "${relativePath}"`,
    );
  }

  const trimmed = relativePath.trim();

  // Reject protocol-relative URLs (// or /\\)
  if (trimmed.startsWith('//') || trimmed.startsWith('/\\') || trimmed.startsWith('\\/')) {
    throw new SecurityUrlError(
      `Protocol-relative path is prohibited for security reasons: "${relativePath}"`,
    );
  }

  // Reject scheme/protocol prefixes (e.g. http:, https:, javascript:, data:)
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    throw new SecurityUrlError(
      `Absolute URLs and custom protocols in request paths are prohibited by default: "${relativePath}". Use relative paths resolved against the configured base URL.`,
    );
  }

  // Normalize base path prefix and relative path
  const basePrefix = baseUrl.pathname.replace(/\/+$/, '');
  const normalizedPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  const targetPath = basePrefix ? `${basePrefix}${normalizedPath}` : normalizedPath;

  // Resolve against base origin
  let resolved: URL;
  try {
    resolved = new URL(targetPath, baseUrl.origin);
  } catch {
    throw new SecurityUrlError(`Could not resolve path "${relativePath}" against base URL`);
  }

  // Ensure origin is identical (prevent DNS / host escaping)
  if (resolved.origin !== baseUrl.origin) {
    throw new SecurityUrlError(
      `Path resolved to a different origin "${resolved.origin}". Cross-origin resolution is prohibited.`,
    );
  }

  // If base URL has a pathname prefix, ensure resolved path does not traverse above it
  if (basePrefix && basePrefix !== '') {
    if (resolved.pathname !== basePrefix && !resolved.pathname.startsWith(basePrefix + '/')) {
      throw new SecurityUrlError(
        `Path escaped base URL path prefix "${basePrefix}": resolved to "${resolved.pathname}".`,
      );
    }
  }

  // Strip client-side fragment identifiers from HTTP request URL
  resolved.hash = '';

  // Append query parameters safely
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        for (const item of value) {
          resolved.searchParams.append(key, String(item));
        }
      } else {
        resolved.searchParams.append(key, String(value));
      }
    }
  }

  return resolved.toString();
}
