import { performance } from 'node:perf_hooks';
import { DEFAULTS } from '../config/defaults.js';
import { PayloadLimitExceededError } from '../security/guards.js';
import { validateRedirectTarget } from './redirects.js';
import { type HttpRequest, type HttpResponse, TransportError } from './types.js';

export class HttpClient {
  /**
   * Executes an HTTP request safely with timeouts spanning header & body retrieval,
   * payload size bounds, redirect leak prevention, and cycle detection.
   */
  public async execute(request: HttpRequest): Promise<HttpResponse> {
    const initialUrl = new URL(request.url);
    const initialOrigin = initialUrl.origin;

    let currentUrl = request.url;
    let currentMethod = request.method;
    let currentBody = request.body;
    let redirectCount = 0;

    const visitedUrls = new Set<string>([currentUrl]);
    const currentHeaders = { ...request.headers };

    const startTime = performance.now();

    while (true) {
      const controller = new AbortController();
      let timedOut = false;

      // Timeout MUST span BOTH header retrieval AND body streaming
      const timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort(new Error('REQUEST_TIMEOUT'));
      }, request.timeoutMs);

      try {
        // Filter out manual Content-Length; native fetch / undici automatically computes this
        const headersToSend: Record<string, string> = {};
        for (const [k, v] of Object.entries(currentHeaders)) {
          if (k.toLowerCase() !== 'content-length') {
            headersToSend[k] = v;
          }
        }

        const fetchOptions: RequestInit = {
          method: currentMethod,
          headers: headersToSend,
          signal: controller.signal,
          redirect: 'manual', // Never let node/undici automatically follow cross-origin redirects
        };

        if (currentBody && currentMethod !== 'GET' && currentMethod !== 'HEAD') {
          fetchOptions.body = currentBody;
        }

        let response: Response;
        try {
          response = await fetch(currentUrl, fetchOptions);
        } catch (fetchErr: unknown) {
          if (timedOut) {
            throw new TransportError(
              `Request timed out after ${request.timeoutMs}ms`,
              true,
              'ETIMEDOUT',
            );
          }

          const errMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
          const errCause = (fetchErr as { cause?: { code?: string; message?: string } })?.cause;
          const code = errCause?.code || 'FETCH_ERROR';
          const detailedMsg = errCause?.message ? `${errMsg}: ${errCause.message}` : errMsg;

          throw new TransportError(`Transport failure (${code}): ${detailedMsg}`, false, code);
        }

        const isRedirectStatus = [301, 302, 303, 307, 308].includes(response.status);

        // Handle redirect policies
        if (isRedirectStatus) {
          if (request.redirect === 'error') {
            // Cancel redirect response body to free socket
            if (response.body) {
              try {
                await response.body.cancel();
              } catch {
                // Ignore cancel errors
              }
            }
            throw new TransportError(
              `Unexpected redirect ${response.status} encountered under redirect policy "error"`,
            );
          }

          if (request.redirect === 'follow-same-origin') {
            if (redirectCount >= DEFAULTS.MAX_REDIRECTS) {
              if (response.body) {
                try {
                  await response.body.cancel();
                } catch {
                  // Ignore
                }
              }
              throw new TransportError(
                `Maximum redirect limit (${DEFAULTS.MAX_REDIRECTS}) exceeded`,
              );
            }

            const location = response.headers.get('location');
            if (!location) {
              if (response.body) {
                try {
                  await response.body.cancel();
                } catch {
                  // Ignore
                }
              }
              throw new TransportError(
                `Redirect response (${response.status}) missing Location header`,
              );
            }

            const nextUrl = validateRedirectTarget(location, currentUrl, initialOrigin);

            // Cancel 3xx response body before following redirect
            if (response.body) {
              try {
                await response.body.cancel();
              } catch {
                // Ignore
              }
            }

            // Detect redirect cycles
            if (visitedUrls.has(nextUrl)) {
              throw new TransportError(`Redirect loop detected: "${nextUrl}" was already visited`);
            }

            currentUrl = nextUrl;
            visitedUrls.add(currentUrl);
            redirectCount++;

            // RFC 7231 / 9110 method rewrite rules on redirect
            if (
              response.status === 303 ||
              ((response.status === 301 || response.status === 302) && currentMethod === 'POST')
            ) {
              currentMethod = 'GET';
              currentBody = undefined;
              // Clean payload headers on rewrite to GET
              for (const headerKey of Object.keys(currentHeaders)) {
                const lower = headerKey.toLowerCase();
                if (lower === 'content-type' || lower === 'content-length') {
                  delete currentHeaders[headerKey];
                }
              }
            }

            // Loop to follow redirect (clearing previous timeoutId first)
            clearTimeout(timeoutId);
            continue;
          }

          // If redirect policy is 'manual', fall through and read the 3xx response body
        }

        // Stream and cap response body with active timeout protection
        let bodyText: string;
        try {
          bodyText = await this.readBoundedBody(response, request.maxBodyBytes, controller);
        } catch (streamErr) {
          if (timedOut) {
            throw new TransportError(
              `Request timed out after ${request.timeoutMs}ms while reading response body`,
              true,
              'ETIMEDOUT',
            );
          }
          throw streamErr;
        }

        const endTime = performance.now();
        const responseTimeMs = Math.round((endTime - startTime) * 100) / 100;

        // Collect response headers
        const headers: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          headers[key.toLowerCase()] = value;
        });

        // Parse JSON if applicable
        let bodyJson: unknown;
        const trimmed = bodyText.trim();
        if (trimmed.length > 0) {
          try {
            bodyJson = JSON.parse(trimmed);
          } catch {
            bodyJson = undefined;
          }
        }

        return {
          status: response.status,
          statusText: response.statusText,
          headers,
          bodyText,
          bodyJson,
          responseTimeMs,
          redirectCount,
          finalUrl: currentUrl,
        };
      } catch (err) {
        if (timedOut) {
          throw new TransportError(
            `Request timed out after ${request.timeoutMs}ms`,
            true,
            'ETIMEDOUT',
          );
        }
        if (err instanceof TransportError || err instanceof PayloadLimitExceededError) {
          throw err;
        }
        throw new TransportError(
          `Request failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        clearTimeout(timeoutId);
      }
    }
  }

  /**
   * Reads the response stream up to maxBytes. Aborts and throws if the response exceeds the bound.
   */
  private async readBoundedBody(
    response: Response,
    maxBytes: number,
    controller: AbortController,
  ): Promise<string> {
    if (!response.body) {
      return '';
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        if (value) {
          receivedBytes += value.byteLength;
          if (receivedBytes > maxBytes) {
            controller.abort(new Error('PAYLOAD_LIMIT_EXCEEDED'));
            throw new PayloadLimitExceededError(receivedBytes, maxBytes);
          }
          chunks.push(value);
        }
      }
    } finally {
      reader.releaseLock();
    }

    const totalBuffer = new Uint8Array(receivedBytes);
    let offset = 0;
    for (const chunk of chunks) {
      totalBuffer.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return new TextDecoder('utf-8').decode(totalBuffer);
  }
}
