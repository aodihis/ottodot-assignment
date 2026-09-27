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

/**
 * The cutoff is a duration, not a calendar date: `startsAt` minus N * 24h in UTC.
 * Computed, never stored, so changing the env var changes it everywhere at once.
 */
export function cancellationDeadline(startsAt: Date): Date {
  return new Date(startsAt.getTime() - cancellationCutoffDays() * 86_400_000);
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
