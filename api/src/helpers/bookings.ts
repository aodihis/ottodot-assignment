/**
 * The booking-lifecycle predicates, in one place.
 *
 * These were open-coded in the classes and students modules — and had already
 * drifted: the seat counts ignored whether the class had started, while child
 * removal did not. A hold's effective expiry is `min(expiresAt, startsAt)`, so a
 * hold on a class that has begun is not live either.
 */

/** How long an unpaid hold lasts before lazy expiry retires it. */
export const HOLD_MINUTES = 15;

/** When a hold taken now would expire. */
export function holdExpiry(from: Date = new Date()) {
  return new Date(from.getTime() + HOLD_MINUTES * 60_000);
}

/** An unpaid hold that still counts: not expired, and its class has not started. */
export function liveHoldWhere(now: Date) {
  return {
    status: 'pending_payment' as const,
    expiresAt: { gt: now },
    trialClass: { startsAt: { gt: now } },
  };
}

/**
 * A booking that still means something to the roster: confirmed, or a live hold.
 * Used to answer "can this child be removed?".
 */
export function activeBookingWhere(now: Date) {
  return {
    trialClass: { startsAt: { gt: now } },
    OR: [
      { status: 'confirmed' as const },
      { status: 'pending_payment' as const, expiresAt: { gt: now } },
    ],
  };
}
