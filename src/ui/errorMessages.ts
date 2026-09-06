/**
 * Turns a thrown value into something a person can act on.
 *
 * Every call site already carries a written fallback. This keeps parser noise,
 * stack text and raw HTTP status lines out of the interface: if the thrown
 * message is not something a user could act on, the fallback is shown instead.
 */

const technicalPatterns: RegExp[] = [
  /unexpected token/i,
  /is not valid json/i,
  /<!doctype/i,
  /json\.parse/i,
  /failed to fetch/i,
  /networkerror/i,
  /load failed/i,
  /\b(?:type|range|reference|syntax)error\b/i,
  /\bundefined\b|\bnull\b/i,
  /\bat\s+\w+\s+\(/,
  /^https?:\/\//i,
  /\bhttp\s*[45]\d\d\b/i,
];

/** Permission and device failures the browser reports by name, not by prose. */
const namedCauses: Record<string, string> = {
  NotAllowedError:
    'Access was blocked. Allow the permission in your browser site settings, then try again.',
  NotFoundError: 'No suitable device was found. Check that it is connected, then try again.',
  NotReadableError: 'The device is already in use by another app. Close that app, then try again.',
  SecurityError: 'The browser blocked this on an insecure connection. Open the app over HTTPS.',
  AbortError: 'That took too long and was stopped. Try again.',
};

export function describeError(error: unknown, fallback: string): string {
  if (typeof error === 'string') {
    return isTechnical(error) ? fallback : error.trim() || fallback;
  }

  if (!(error instanceof Error)) {
    return fallback;
  }

  const named = namedCauses[error.name];
  if (named) {
    return named;
  }

  const message = error.message.trim();
  if (!message || isTechnical(message)) {
    return fallback;
  }
  return message;
}

function isTechnical(message: string): boolean {
  return technicalPatterns.some((pattern) => pattern.test(message));
}
