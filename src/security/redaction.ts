const SENSITIVE_HEADER_NAMES = new Set([
  'authorization',
  'proxy-authorization',
  'x-api-key',
  'cookie',
  'set-cookie',
  'apikey',
  'api-key',
  'x-auth-token',
  'session',
  'x-access-token',
  'x-secret',
  'token',
]);

const SENSITIVE_QUERY_PATTERNS = [
  /token/i,
  /secret/i,
  /password/i,
  /passwd/i,
  /auth/i,
  /access_token/i,
  /api_key/i,
  /apikey/i,
  /private_key/i,
  /client_secret/i,
  /key/i,
];

export class RedactionRegistry {
  private secrets = new Set<string>();

  constructor(initialSecrets?: string[]) {
    if (initialSecrets) {
      this.addSecrets(initialSecrets);
    }
  }

  public addSecret(secret: string): void {
    if (secret && typeof secret === 'string' && secret.trim().length >= 3) {
      const trimmed = secret.trim();
      this.secrets.add(trimmed);

      // Register percent-encoded variations if different
      try {
        const encodedComponent = encodeURIComponent(trimmed);
        if (encodedComponent !== trimmed) {
          this.secrets.add(encodedComponent);
        }
        const encodedUri = encodeURI(trimmed);
        if (encodedUri !== trimmed) {
          this.secrets.add(encodedUri);
        }
        const decoded = decodeURIComponent(trimmed);
        if (decoded !== trimmed && decoded.length >= 3) {
          this.secrets.add(decoded);
        }
      } catch {
        // Ignore URI malformed errors on synthetic tokens
      }
    }
  }

  public addSecrets(secrets: string[]): void {
    for (const secret of secrets) {
      this.addSecret(secret);
    }
  }

  public getSecrets(): string[] {
    return Array.from(this.secrets);
  }

  /**
   * Redacts sensitive headers.
   */
  public redactHeaders(headers: Record<string, string>): Record<string, string> {
    const redacted: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      const lower = key.toLowerCase();
      if (
        SENSITIVE_HEADER_NAMES.has(lower) ||
        lower.includes('auth') ||
        lower.includes('secret') ||
        lower.includes('token') ||
        lower.includes('key')
      ) {
        redacted[key] = '[REDACTED]';
      } else {
        redacted[key] = this.redactText(value);
      }
    }
    return redacted;
  }

  /**
   * Redacts sensitive query parameters, embedded credentials, and secret strings from a URL.
   */
  public redactUrl(urlStr: string): string {
    try {
      const url = new URL(urlStr);

      // Redact embedded credentials if present
      if (url.username) url.username = '[REDACTED]';
      if (url.password) url.password = '[REDACTED]';

      // Redact sensitive query parameters
      for (const [key] of Array.from(url.searchParams.entries())) {
        const isSensitive = SENSITIVE_QUERY_PATTERNS.some((pattern) => pattern.test(key));
        if (isSensitive) {
          url.searchParams.set(key, '[REDACTED]');
        } else {
          const val = url.searchParams.get(key);
          if (val) {
            url.searchParams.set(key, this.redactText(val));
          }
        }
      }

      // Also scrub any registered secrets from the entire resulting URL (including path)
      return this.redactText(url.toString());
    } catch {
      return this.redactText(urlStr);
    }
  }

  /**
   * Redacts all registered secret strings and patterns from a string.
   */
  public redactText(text: string): string {
    if (!text || typeof text !== 'string') return text;

    let result = text;

    // Redact explicit registered secrets
    for (const secret of this.secrets) {
      if (secret.length < 3) continue;
      result = result.split(secret).join('[REDACTED]');
    }

    // Redact Bearer tokens
    result = result.replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]');

    // Redact Basic auth tokens
    result = result.replace(/Basic\s+[A-Za-z0-9+/=]+/gi, 'Basic [REDACTED]');

    return result;
  }

  /**
   * Recursively redacts secrets and sensitive keys from any arbitrary object or array.
   */
  public redactDeep<T>(value: T): T {
    if (typeof value === 'string') {
      return this.redactText(value) as T;
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.redactDeep(item)) as T;
    }
    if (value !== null && typeof value === 'object') {
      if (value instanceof Error) {
        const clone = new Error(this.redactText(value.message));
        clone.name = value.name;
        if (value.stack) clone.stack = this.redactText(value.stack);
        return clone as unknown as T;
      }

      const clone: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        const lowerK = k.toLowerCase();
        const isSensitiveKey =
          SENSITIVE_HEADER_NAMES.has(lowerK) ||
          SENSITIVE_QUERY_PATTERNS.some((p) => p.test(lowerK));

        if (isSensitiveKey && typeof v === 'string') {
          clone[k] = '[REDACTED]';
        } else {
          clone[k] = this.redactDeep(v);
        }
      }
      return clone as T;
    }
    return value;
  }
}
