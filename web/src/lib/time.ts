/**
 * The pure half of the hold timer, kept out of the component so it can be tested
 * in a plain node environment.
 *
 * `hasLapsed` is deliberately the same comparison the server makes before it will
 * take a payment (`booking.expiresAt <= now`), against the server's own
 * `expiresAt`. It is not a re-implementation of a rule — it is the same test on
 * the same number, and it can only ever *withhold* an affordance. Paying is what
 * actually decides, and it answers `BOOKING_EXPIRED` if this was too optimistic.
 */
export function hasLapsed(expiresAt: string, now: number = Date.now()): boolean {
  return new Date(expiresAt).getTime() <= now;
}

/** Whole seconds remaining, never negative. */
export function secondsLeft(expiresAt: string, now: number = Date.now()): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000));
}

/** A countdown a person can read: `9:05`, or `1h 02m` once it is long. */
export function formatCountdown(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;

  if (minutes >= 60) {
    return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
  }
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

/**
 * A class's start time in the reader's own timezone. The server sends UTC and
 * the browser knows where it is, so this is the one place that converts — and
 * it is only ever for display.
 */
export function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
