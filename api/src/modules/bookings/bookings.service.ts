import { randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client';
import type { BookingStatus, CancelledReason } from '../../generated/prisma/enums';
import type { Db } from '../../db';
import { cancellability, expiredHoldWhere, holdExpiry, liveHoldItemWhere } from '../../helpers/bookings';
import { registerChildren, seatsAvailable } from '../../helpers/seats';
import { cancellationDeadline } from '../../helpers/config';
import { utcNow } from '../../helpers/datetime';
import { ApiError } from '../../helpers/http';
import { money, moneyJson, sumMoney } from '../../helpers/money';
import { evaluateCard, maskCard, normalizeCardNumber, type MaskedCard } from '../../helpers/payments';
import { isActiveChild } from '../../helpers/students';

export const bookingInclude = {
  items: { include: { student: true, trialClass: true }, orderBy: { createdAt: 'asc' } },
  payments: { orderBy: { createdAt: 'asc' } },
} as const;

export type BookingWithRelations = Prisma.BookingGetPayload<{ include: typeof bookingInclude }>;

const DEFAULT_CURRENCY = 'SGD';

/** The JSON shape of a booking — money as numbers, timestamps as UTC ISO strings. */
export function bookingView(booking: BookingWithRelations) {
  const now = utcNow();
  const startsAt = booking.items[0]?.trialClass.startsAt ?? null;
  const deadline = startsAt ? cancellationDeadline(startsAt) : null;

  return {
    id: booking.id,
    status: booking.status,
    parentId: booking.parentId,
    amount: moneyJson(booking.amount),
    currency: booking.currency,
    // One already-reduced expiry: the client never re-derives min(hold, class).
    expiresAt: startsAt
      ? new Date(Math.min(booking.expiresAt.getTime(), startsAt.getTime()))
      : booking.expiresAt,
    confirmedAt: booking.confirmedAt,
    cancelledAt: booking.cancelledAt,
    cancelledReason: booking.cancelledReason,
    // The same rule `cancelBooking` branches on, asked once: a UI offering a
    // cancel button and the server accepting it cannot disagree.
    canCancel: cancellability({ status: booking.status, startsAt }, now) === 'cancellable',
    cancellationDeadline: deadline,
    items: booking.items.map((item) => ({
      id: item.id,
      studentId: item.studentId,
      name: item.student.name,
      classId: item.classId,
      class: { id: item.trialClass.id, title: item.trialClass.title, startsAt: item.trialClass.startsAt },
      price: moneyJson(item.price),
      refundedAt: item.refundedAt,
      refundAmount: item.refundAmount === null ? null : moneyJson(item.refundAmount),
    })),
    payments: booking.payments.map(paymentView),
  };
}

export function paymentView(payment: BookingWithRelations['payments'][number]) {
  return {
    id: payment.id,
    type: payment.type,
    status: payment.status,
    amount: moneyJson(payment.amount),
    currency: payment.currency,
    method: payment.method,
    card: parseCard(payment.card),
    reference: payment.reference,
    failureReason: payment.failureReason,
    createdAt: payment.createdAt,
  };
}

/** Stored as JSON; anything unparsable is reported as unknown rather than crashing a response. */
function parseCard(card: string | null): MaskedCard | null {
  if (!card) return null;
  try {
    return JSON.parse(card) as MaskedCard;
  } catch {
    return { brand: 'unknown', last4: '****' };
  }
}

const reference = (prefix: 'ch' | 'rf') => `mock_${prefix}_${randomUUID()}`;

async function writePayment(
  tx: Prisma.TransactionClient,
  input: {
    bookingId: string;
    type: 'charge' | 'refund';
    status: 'succeeded' | 'failed';
    amount: Prisma.Decimal;
    currency: string;
    card: MaskedCard | null;
    failureReason?: string;
    reversalOfId?: string;
    payload?: Record<string, unknown>;
  },
) {
  return tx.payment.create({
    data: {
      bookingId: input.bookingId,
      type: input.type,
      status: input.status,
      amount: input.amount,
      currency: input.currency,
      method: 'card',
      card: input.card ? JSON.stringify(input.card) : null,
      reference: reference(input.type === 'charge' ? 'ch' : 'rf'),
      failureReason: input.failureReason ?? null,
      reversalOfId: input.reversalOfId ?? null,
      payload: input.payload ? JSON.stringify(input.payload) : null,
    },
  });
}

/**
 * Ends a booking on a refused charge: one failed payment row, and the order moved
 * out of `pending_payment`. Every refusal does both — a rejected payment must not
 * leave a live-looking selection behind — so they share one shape instead of
 * three near-identical blocks. A declined card is terminal (`payment_failed`); a
 * seat that went to someone else is a cancellation with a reason.
 */
async function refuseCharge(
  tx: Prisma.TransactionClient,
  booking: BookingWithRelations,
  input: {
    card: MaskedCard;
    now: Date;
    failureReason: string;
    payload?: Record<string, unknown>;
    ending: { status: BookingStatus; cancelledReason?: CancelledReason };
  },
) {
  await writePayment(tx, {
    bookingId: booking.id,
    type: 'charge',
    status: 'failed',
    amount: booking.amount,
    currency: booking.currency,
    card: input.card,
    failureReason: input.failureReason,
    payload: input.payload,
  });

  return tx.booking.update({
    where: { id: booking.id },
    data: {
      status: input.ending.status,
      ...(input.ending.cancelledReason
        ? { cancelledReason: input.ending.cancelledReason, cancelledAt: input.now }
        : {}),
    },
    include: bookingInclude,
  });
}

/**
 * Retires holds that have lapsed or whose class has started. Idempotent, and safe
 * against a payment landing at the same moment: both this and the pay path claim
 * `Booking.status`, so whoever writes first wins and the loser's zero-row update
 * is the signal. It never touches `confirmedCount` — a hold never held a seat.
 */
export async function expireHolds(db: Db, now: Date = utcNow()) {
  return db.$transaction((tx) => expireHoldsIn(tx, now));
}

export async function createBooking(
  db: Db,
  parentId: string,
  input: { classId: string; studentIds: string[] },
) {
  const now = utcNow();

  return db.$transaction(async (tx) => {
    // Housekeeping first, so a lapsed hold for the same child and class cannot
    // block a fresh selection (it is retired rather than treated as active).
    await expireHoldsIn(tx, now);

    const trialClass = await tx.trialClass.findUnique({ where: { id: input.classId } });
    if (!trialClass) throw new ApiError(404, 'CLASS_NOT_FOUND', 'No such class');
    if (trialClass.startsAt <= now) {
      throw new ApiError(409, 'CLASS_ALREADY_STARTED', 'That class has already started');
    }

    const students = await tx.student.findMany({ where: { id: { in: input.studentIds } } });
    const byId = new Map(students.map((student) => [student.id, student]));
    const missing = input.studentIds.filter((id) => !byId.has(id));
    if (missing.length > 0) {
      throw new ApiError(404, 'STUDENT_NOT_FOUND', 'No such child', { studentIds: missing });
    }

    const notYours = students.filter(
      (student) => student.parentId !== parentId || !isActiveChild(student),
    );
    if (notYours.length > 0) {
      throw new ApiError(403, 'NOT_YOUR_STUDENT', 'That child is not yours', {
        studentIds: notYours.map((student) => student.id),
      });
    }

    // Two different questions, asked separately: is the child registered here
    // already (an enrollment), and are they holding a selection (a live hold)?
    const [enrolled, held] = await Promise.all([
      tx.enrollment.findMany({
        where: { classId: trialClass.id, studentId: { in: input.studentIds } },
        select: { studentId: true },
      }),
      tx.bookingItem.findMany({
        where: { classId: trialClass.id, studentId: { in: input.studentIds }, ...liveHoldItemWhere(now) },
        select: { studentId: true },
      }),
    ]);

    const alreadyIn = [...new Set([...enrolled, ...held].map((row) => row.studentId))];
    if (alreadyIn.length > 0) {
      throw new ApiError(
        409,
        'DUPLICATE_ACTIVE_BOOKING',
        'That child is already registered for this class, or is holding a selection for it',
        { studentIds: alreadyIn },
      );
    }

    // Friendly fail-fast: the authoritative check is at payment time.
    const seatsLeft = seatsAvailable(trialClass);
    if (input.studentIds.length > seatsLeft) {
      throw new ApiError(409, 'CLASS_FULL', 'There are not enough seats left for this booking', {
        requested: input.studentIds.length,
        seatsAvailable: seatsLeft,
      });
    }

    const price = money(trialClass.price);
    const booking = await tx.booking.create({
      data: {
        parentId,
        status: 'pending_payment',
        amount: sumMoney(input.studentIds.map(() => price)),
        currency: DEFAULT_CURRENCY,
        expiresAt: holdExpiry(now),
        items: {
          create: input.studentIds.map((studentId) => ({
            studentId,
            classId: trialClass.id,
            price,
          })),
        },
      },
      include: bookingInclude,
    });

    return booking;
  });
}

/** The sweep, inside a caller's transaction (creation reuses it to tidy up first). */
async function expireHoldsIn(tx: Prisma.TransactionClient, now: Date) {
  const expired = await tx.booking.findMany({ where: expiredHoldWhere(now), select: { id: true } });
  if (expired.length === 0) return { bookings: 0 };

  // Only the order is written: a retired selection was never a registration, and
  // no line carries state any more. Nothing is released either — a hold never
  // took a seat — so the count of selections is the whole of what changed.
  const bookings = await tx.booking.updateMany({
    where: { id: { in: expired.map((booking) => booking.id) }, status: 'pending_payment' },
    data: { status: 'cancelled', cancelledReason: 'expired', cancelledAt: now },
  });

  return { bookings: bookings.count };
}

async function loadBooking(tx: Prisma.TransactionClient, bookingId: string) {
  const booking = await tx.booking.findUnique({ where: { id: bookingId }, include: bookingInclude });
  if (!booking) throw new ApiError(404, 'BOOKING_NOT_FOUND', 'No such booking');
  return booking;
}

/** The booking as it stands now, for a response that must show what was just written. */
function reloadBooking(tx: Prisma.TransactionClient, bookingId: string) {
  return tx.booking.findUniqueOrThrow({ where: { id: bookingId }, include: bookingInclude });
}

/** The booking, or the error that says why this parent may not touch it. */
async function ownedBooking(tx: Prisma.TransactionClient, bookingId: string, parentId: string) {
  const booking = await loadBooking(tx, bookingId);
  if (booking.parentId !== parentId) {
    throw new ApiError(403, 'NOT_YOUR_BOOKING', 'That booking belongs to another parent');
  }
  return booking;
}

export function getBooking(db: Db, bookingId: string, parentId: string) {
  return ownedBooking(db, bookingId, parentId);
}

/**
 * This parent's orders, newest first — the screen that shows a booking's status,
 * its hold timer and its refund history.
 *
 * Housekeeping runs first for the same reason `createBooking` runs it: a selection
 * that has already lapsed must not be listed as if it were still waiting for
 * payment. The client cannot tell a lapsed hold from a live one otherwise, and it
 * is the client that decides whether to offer the pay button. `expireHolds` is
 * idempotent, so a read that sweeps is still safe to repeat.
 */
export async function listBookings(db: Db, parentId: string) {
  await expireHolds(db);

  return db.booking.findMany({
    where: { parentId },
    // `id` breaks the tie: `createdAt` is stored at millisecond granularity, so two
    // orders placed in the same tick would otherwise come back in an arbitrary order.
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: bookingInclude,
  });
}

/** The charge that made this booking paid, if any. */
export function settledCharge(booking: BookingWithRelations) {
  return (
    [...booking.payments].reverse().find((p) => p.type === 'charge' && p.status === 'succeeded') ?? null
  );
}

/** The most recent payment row — what a rejection needs to show what happened. */
export function latestPayment(booking: BookingWithRelations) {
  return booking.payments.at(-1) ?? null;
}

export function refundOf(booking: BookingWithRelations) {
  return booking.payments.find((p) => p.type === 'refund') ?? null;
}

export type PayResult =
  | { kind: 'confirmed'; booking: BookingWithRelations }
  | { kind: 'declined'; booking: BookingWithRelations; reason: string }
  | { kind: 'seat_taken'; booking: BookingWithRelations; requested: number; seatsAvailable: number }
  | { kind: 'duplicate'; booking: BookingWithRelations }
  | { kind: 'already_confirmed'; booking: BookingWithRelations }
  | { kind: 'expired'; booking: BookingWithRelations }
  | { kind: 'not_payable'; booking: BookingWithRelations }
  | { kind: 'class_started'; booking: BookingWithRelations };

/**
 * Payment is where a selection becomes a booking. The seats are re-counted from
 * the database inside this transaction — never trusted from the selection — and
 * the card is decided first (pre-authorisation), so a parent who loses the last
 * seat was never charged and needs no refund.
 */
export async function payBooking(
  db: Db,
  bookingId: string,
  parentId: string,
  card: { number: string; holder?: string },
): Promise<PayResult> {
  const digits = normalizeCardNumber(card.number);
  const outcome = evaluateCard(digits);
  if (outcome.kind === 'invalid') {
    // Nothing has changed yet: the hold is still live and payable with a good card.
    throw new ApiError(422, 'INVALID_CARD', 'That card number is not valid');
  }

  const masked = maskCard(digits, card.holder);
  const now = utcNow();

  const result = await db.$transaction(async (tx): Promise<PayResult> => {
    const booking = await ownedBooking(tx, bookingId, parentId);

    // Double-pay is idempotent, not an error: the same charge is returned.
    if (booking.status === 'confirmed') return { kind: 'already_confirmed', booking };

    // The stored status is checked before the timer: once a booking has been
    // retired (cancelled, failed), that is the truthful answer — "expired" only
    // describes a selection that is still merely late.
    if (booking.status !== 'pending_payment') return { kind: 'not_payable', booking };

    const startsAt = booking.items[0]?.trialClass.startsAt ?? null;
    if (startsAt !== null && startsAt <= now) {
      return { kind: 'class_started', booking };
    }
    if (booking.expiresAt <= now) return { kind: 'expired', booking };

    if (outcome.kind === 'declined') {
      const failed = await refuseCharge(tx, booking, {
        card: masked,
        now,
        failureReason: outcome.reason,
        payload: { outcome: outcome.reason, amount: moneyJson(booking.amount) },
        ending: { status: 'payment_failed' },
      });
      return { kind: 'declined', booking: failed, reason: outcome.reason };
    }

    // One class per booking — the API books one class for N children — so every
    // line shares it, and all-or-nothing is a single test: the whole order fits,
    // or none of it is written.
    const classId = booking.items[0]!.classId;
    const seats = booking.items.length;

    // Duplicate re-check: another booking may have registered the same child here
    // while this one was being paid for.
    const clashing = await tx.enrollment.findFirst({
      where: { classId, studentId: { in: booking.items.map((item) => item.studentId) } },
      select: { studentId: true },
    });
    if (clashing) {
      const cancelled = await refuseCharge(tx, booking, {
        card: masked,
        now,
        failureReason: 'duplicate_booking',
        ending: { status: 'cancelled', cancelledReason: 'duplicate_booking' },
      });
      return { kind: 'duplicate', booking: cancelled };
    }

    // The seats are re-counted from the database inside this transaction, never
    // trusted from the selection.
    const trialClass = await tx.trialClass.findUniqueOrThrow({ where: { id: classId } });
    const seatsLeft = seatsAvailable(trialClass);

    if (seats > seatsLeft) {
      const cancelled = await refuseCharge(tx, booking, {
        card: masked,
        now,
        failureReason: 'seat_taken',
        payload: { requested: seats, seatsAvailable: seatsLeft },
        ending: { status: 'cancelled', cancelledReason: 'seat_taken' },
      });
      return { kind: 'seat_taken', booking: cancelled, requested: seats, seatsAvailable: seatsLeft };
    }

    // Claim the order first: this is the gate that decides who owns the booking,
    // so nothing is taken for one that somebody else has already paid for.
    const claimed = await tx.booking.updateMany({
      where: { id: booking.id, status: 'pending_payment' },
      data: { status: 'confirmed', confirmedAt: now },
    });
    if (claimed.count === 0) {
      const current = await reloadBooking(tx, booking.id);
      return current.status === 'confirmed'
        ? { kind: 'already_confirmed', booking: current }
        : { kind: 'not_payable', booking: current };
    }

    await registerChildren(tx, {
      classId,
      capacity: trialClass.capacity,
      now,
      items: booking.items,
    });

    await writePayment(tx, {
      bookingId: booking.id,
      type: 'charge',
      status: 'succeeded',
      amount: booking.amount,
      currency: booking.currency,
      card: masked,
      payload: { outcome: 'approved', amount: moneyJson(booking.amount) },
    });

    return { kind: 'confirmed', booking: await reloadBooking(tx, booking.id) };
  });

  return result;
}

export type CancelResult =
  | { kind: 'cancelled'; booking: BookingWithRelations }
  | { kind: 'not_cancellable'; booking: BookingWithRelations }
  | { kind: 'window_closed'; booking: BookingWithRelations }
  | { kind: 'class_started'; booking: BookingWithRelations };

export async function cancelBooking(db: Db, bookingId: string, parentId: string): Promise<CancelResult> {
  const now = utcNow();

  return db.$transaction(async (tx): Promise<CancelResult> => {
    const booking = await ownedBooking(tx, bookingId, parentId);
    const startsAt = booking.items[0]?.trialClass.startsAt ?? null;
    const verdict = cancellability({ status: booking.status, startsAt }, now);

    if (verdict === 'class_started') return { kind: 'class_started', booking };
    if (booking.status === 'cancelled') {
      // Idempotent: a second cancel returns the booking and the refund it already got.
      return { kind: 'cancelled', booking };
    }
    if (verdict !== 'cancellable') return { kind: verdict, booking };

    if (booking.status === 'confirmed') {
      const claimed = await tx.booking.updateMany({
        where: { id: booking.id, status: 'confirmed' },
        data: { status: 'cancelled', cancelledReason: 'parent_cancelled', cancelledAt: now },
      });
      if (claimed.count === 0) {
        const current = await reloadBooking(tx, booking.id);
        return current.status === 'cancelled'
          ? { kind: 'cancelled', booking: current }
          : { kind: 'not_cancellable', booking: current };
      }

      // One class per booking, so the seats come back in one statement. The guard
      // is a backstop: a counter that would go negative means the two drifted.
      const classId = booking.items[0]!.classId;
      const seats = booking.items.length;
      const released = await tx.trialClass.updateMany({
        where: { id: classId, confirmedCount: { gte: seats } },
        data: { confirmedCount: { decrement: seats } },
      });
      if (released.count === 0) {
        throw new Error(`seat release failed for class ${classId} — confirmedCount would go negative`);
      }

      const charge = settledCharge(booking);
      await writePayment(tx, {
        bookingId: booking.id,
        type: 'refund',
        status: 'succeeded',
        amount: booking.amount,
        currency: booking.currency,
        card: charge ? parseCard(charge.card) : null,
        reversalOfId: charge?.id,
        payload: { reason: 'parent_cancelled', amount: moneyJson(booking.amount) },
      });

      // Per item, because each carries its own price — the refund Payment row is
      // the authoritative total.
      for (const item of booking.items) {
        await tx.bookingItem.update({
          where: { id: item.id },
          data: { refundedAt: now, refundAmount: item.price },
        });
      }

      // Refunded means no longer registered: the enrollment goes, which keeps the
      // unique index a plain one and takes the child off the roster.
      await tx.enrollment.deleteMany({
        where: { bookingItemId: { in: booking.items.map((item) => item.id) } },
      });

      return { kind: 'cancelled', booking: await reloadBooking(tx, booking.id) };
    }

    // A selection that was never paid for: release it, no money involved.
    await tx.booking.updateMany({
      where: { id: booking.id, status: 'pending_payment' },
      data: { status: 'cancelled', cancelledReason: 'parent_cancelled', cancelledAt: now },
    });
    return { kind: 'cancelled', booking: await reloadBooking(tx, booking.id) };
  });
}
