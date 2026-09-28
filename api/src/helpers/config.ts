export const DEFAULT_CANCELLATION_CUTOFF_DAYS = 5;

/**
 * How many days before a class starts a confirmed booking can still be cancelled
 * (and refunded). Read at call time rather than at import time, so tests can drive
 * both sides of the window without restarting the process.
 */
export function cancellationCutoffDays(): number {
  const raw = process.env.CANCELLATION_CUTOFF_DAYS;
  if (raw === undefined || raw.trim() === '') return DEFAULT_CANCELLATION_CUTOFF_DAYS;

  const days = Number(raw);
  if (!Number.isFinite(days) || days < 0) {
    throw new Error(`CANCELLATION_CUTOFF_DAYS must be a number >= 0 (got "${raw}")`);
  }
  return days;
}

export const DEFAULT_BOOKING_HOLD_MINUTES = 15;

/**
 * How long a parent's selection is held before it lapses. Read at call time, so a
 * demo can shrink the timer (and show the sweep releasing seats) without editing
 * code or restarting anything.
 */
export function bookingHoldMinutes(): number {
  const raw = process.env.BOOKING_HOLD_MINUTES;
  if (raw === undefined || raw.trim() === '') return DEFAULT_BOOKING_HOLD_MINUTES;

  const minutes = Number(raw);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    throw new Error(`BOOKING_HOLD_MINUTES must be a number > 0 (got "${raw}")`);
  }
  return minutes;
}

/**
 * The cutoff is a duration, not a calendar date: `startsAt` minus N * 24h in UTC.
 * Computed, never stored, so changing the env var changes it everywhere at once.
 */
export function cancellationDeadline(startsAt: Date): Date {
  return new Date(startsAt.getTime() - cancellationCutoffDays() * 86_400_000);
}

/** The environments that serve the API reference. Anything else, including unset. */
const DOCS_ENVIRONMENTS = ['development', 'test'];

/**
 * Whether the API reference (`/scalar`, and the document behind it at `/doc`) is
 * served. It is a complete map of the API surface — every route, every request
 * and response shape, and the session scheme — so it is served only where it is
 * meant to be.
 *
 * Fails closed, like `sessionSecret` below and for the same reason: an unset or
 * misspelled NODE_ENV must not be what quietly publishes the API. Read at call
 * time, so a test can drive either side without restarting the process.
 */
export function docsEnabled(): boolean {
  return DOCS_ENVIRONMENTS.includes(process.env.NODE_ENV ?? '');
}

/**
 * The session signing key. Deliberately fails closed: a fallback constant would
 * be published in this repository, so a server that booted without a configured
 * secret would accept cookies anyone could forge. Read at call time, and checked
 * at boot, so a missing secret is a loud startup error rather than a silent
 * authentication bypass.
 */
export function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret) {
    throw new Error(
      'SESSION_SECRET is not set. Generate one (e.g. `openssl rand -base64 32`) and put it in api/.env',
    );
  }
  return secret;
}
