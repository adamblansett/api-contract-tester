import type { HttpMethod } from '../spec/types.js';
import type { RedirectPolicy } from '../config/defaults.js';

export interface HttpRequest {
  url: string;
  method: HttpMethod;
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
  redirect: RedirectPolicy;
  maxBodyBytes: number;
}

export interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  bodyText: string;
  bodyJson?: unknown;
  responseTimeMs: number;
  redirectCount: number;
  finalUrl: string;
}

export class TransportError extends Error {
  public readonly isTimeout: boolean;
  public readonly code?: string;

  constructor(message: string, isTimeout = false, code?: string) {
    super(message);
    this.name = 'TransportError';
    this.isTimeout = isTimeout;
    this.code = code;
  }
}
