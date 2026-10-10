export class RedirectSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RedirectSecurityError';
  }
}

/**
 * Validates a redirect target URL against the original request origin.
 * Enforces same-origin redirects and blocks protocol/cross-origin hopping
 * and embedded credential injection.
 */
export function validateRedirectTarget(
  locationHeader: string,
  currentUrl: string,
  initialOrigin: string,
): string {
  if (!locationHeader) {
    throw new RedirectSecurityError('Redirect response missing Location header');
  }

  let nextUrl: URL;
  try {
    nextUrl = new URL(locationHeader, currentUrl);
  } catch {
    throw new RedirectSecurityError(`Invalid redirect Location: "${locationHeader}"`);
  }

  if (nextUrl.protocol !== 'http:' && nextUrl.protocol !== 'https:') {
    throw new RedirectSecurityError(
      `Redirect target uses disallowed protocol "${nextUrl.protocol}". Only http: and https: are allowed.`,
    );
  }

  if (nextUrl.origin !== initialOrigin) {
    throw new RedirectSecurityError(
      `Cross-origin redirect from "${initialOrigin}" to "${nextUrl.origin}" is prohibited by default security policy.`,
    );
  }

  // Reject embedded credentials in redirect targets
  if (nextUrl.username || nextUrl.password) {
    throw new RedirectSecurityError(
      'Redirect Location header contains embedded credentials, which is prohibited for security reasons',
    );
  }

  return nextUrl.toString();
}
