import type { BookingStatus } from '../generated/prisma/enums';
import { bookingHoldMinutes, cancellationDeadline } from './config';

/**
 * The booking-lifecycle rules, in one place.
 *
 * There is one projection of liveness — the line item's, because the line is what
 * the per-class counts, the roster, the duplicate check and child removal all ask
 * about — and the sweep's predicate is its exact complement.
 * `tests/integration/sweep.test.ts` pins that they stay complements, because
 * predicate drift is the bug class that already bit this codebase once.
 */

/** When a hold taken at `from` expires. */
export function holdExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + bookingHoldMinutes() * 60_000);
}

/**
 * Liveness, asked of a line item — used by the class counts and the roster. Note
 * where the state comes from: the line itself has none, so this asks its order.
 * That is the whole reason the predicate is expressed this way.
 */
export function liveHoldItemWhere(now: Date) {
  return {
    trialClass: { startsAt: { gt: now } },
    booking: { status: 'pending_payment' as const, expiresAt: { gt: now } },
  };
}

/**
 * "Has this child a seat here?" is no longer a predicate on this file: a seat is
 * an `Enrollment` row (a registration), and a selection is `liveHoldItemWhere`.
 * The two questions are asked separately, which is why the overloaded
 * `activeItemWhere` that used to answer both is gone.
 */

/**
 * What the sweep retires: still unpaid, and either past its timer or with a
 * class that has already started. The complement of `liveHoldItemWhere`, at the
 * level of the order that owns the timer.
 */
export function expiredHoldWhere(now: Date) {
  return {
    status: 'pending_payment' as const,
    OR: [
      { expiresAt: { lte: now } },
      { items: { some: { trialClass: { startsAt: { lte: now } } } } },
    ],
  };
}

export type Cancellability = 'cancellable' | 'window_closed' | 'not_cancellable' | 'class_started';

/**
 * May this booking still be cancelled? One rule with two consumers that used to
 * each state it their own way and be kept in agreement by hand: `bookingView`
 * renders it as the `canCancel` flag a UI branches on, and `cancelBooking`
 * branches on the same answer.
 */
export function cancellability(
  booking: { status: BookingStatus; startsAt: Date | null },
  now: Date,
): Cancellability {
  if (booking.startsAt !== null && booking.startsAt <= now) return 'class_started';
  if (booking.status === 'pending_payment') return 'cancellable';
  // `cancelled` and `payment_failed` are both terminal. A second cancel is
  // handled as an idempotent success by the caller, before this is asked.
  if (booking.status !== 'confirmed') return 'not_cancellable';

  const deadline = booking.startsAt === null ? null : cancellationDeadline(booking.startsAt);
  return deadline !== null && now <= deadline ? 'cancellable' : 'window_closed';
}
