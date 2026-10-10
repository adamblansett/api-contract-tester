export const DEFAULTS = {
  TIMEOUT_MS: 30000,
  MAX_BODY_BYTES: 5 * 1024 * 1024, // 5 MB
  CONCURRENCY: 1,
  REDIRECT_POLICY: 'manual' as const,
  ALLOW_DESTRUCTIVE: false,
  MAX_REDIRECTS: 5,
};

export type RedirectPolicy = 'manual' | 'follow-same-origin' | 'error';
