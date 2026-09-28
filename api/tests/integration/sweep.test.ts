import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { expiredHoldWhere, liveHoldItemWhere } from '../../src/helpers/bookings';
import { wipeAll } from '../../src/helpers/reset';
import { expireHolds } from '../../src/modules/bookings/bookings.service';
import { loginAs } from '../helpers/api';
import { createTestApp } from '../helpers/app';
import { expectSeatCountsConsistent } from '../helpers/assertions';
import { createBooking, createClass, createUser, inDays, minutesFromNow } from '../helpers/fixtures';

const { db, app, api } = createTestApp();

const GOOD_CARD = { number: '4242 4242 4242 4242' };

let nadiaCookie: string;
let alyaId: string;

beforeEach(async () => {
  await wipeAll(db);

  const nadia = await createUser(db, { email: 'nadia@test.dev', name: 'Nadia', students: ['Alya'] });
  alyaId = nadia.parent!.students[0].id;
  nadiaCookie = await loginAs(db, 'nadia@test.dev');
});

afterAll(async () => {
  await db.$disconnect();
});

/**
 * Predicate drift is the bug class that already bit this codebase once, so the
 * sweep is pinned against the predicate production actually runs: a selection is
 * retired exactly when none of its lines is live.
 */
describe('the sweep predicate', () => {
  it('retires exactly the unpaid selections whose lines are no longer live', async () => {
    const now = new Date();
    const trialClass = await createClass(db, { capacity: 10, startsAt: inDays(7) });
    const startedClass = await createClass(db, { capacity: 10, startsAt: inDays(-1) });

    const live = await createBooking(db, {
      studentIds: [alyaId],
      classId: trialClass.id,
      expiresAt: minutesFromNow(1),
    });
    const lapsed = await createBooking(db, {
      studentIds: [alyaId],
      classId: trialClass.id,
      expiresAt: minutesFromNow(-1),
    });
    const classStarted = await createBooking(db, {
      studentIds: [alyaId],
      classId: startedClass.id,
      expiresAt: minutesFromNow(60),
    });
    const confirmed = await createBooking(db, {
      studentIds: [alyaId],
      classId: trialClass.id,
      status: 'confirmed',
      expiresAt: minutesFromNow(-1),
    });

    const liveOrderIds = new Set(
      (
        await db.bookingItem.findMany({
          where: liveHoldItemWhere(now),
          select: { bookingId: true },
        })
      ).map((item) => item.bookingId),
    );
    const sweptIds = (
      await db.booking.findMany({ where: expiredHoldWhere(now), select: { id: true } })
    ).map((booking) => booking.id);

    expect([...liveOrderIds]).toEqual([live.id]);
    // A lapsed timer and a started class are both "no longer live"; a confirmed
    // booking is neither, however old its timer.
    expect(sweptIds.sort()).toEqual([classStarted.id, lapsed.id].sort());
    expect(sweptIds).not.toContain(confirmed.id);
  });
});

describe('expireHolds', () => {
  it('retires a lapsed selection, frees nothing, and reports what it changed', async () => {
    const trialClass = await createClass(db, { capacity: 4, startsAt: inDays(7) });
    const stale = await createBooking(db, {
      studentIds: [alyaId],
      classId: trialClass.id,
      expiresAt: minutesFromNow(-1),
    });

    const result = await expireHolds(db);

    expect(result).toEqual({ bookings: 1 });
    const booking = await db.booking.findUniqueOrThrow({ where: { id: stale.id } });
    expect(booking.status).toBe('cancelled');
    expect(booking.cancelledReason).toBe('expired');
    expect(booking.cancelledAt).not.toBeNull();
    // A lapsed selection was never a registration, so nothing to remove.
    expect(await db.enrollment.count({ where: { bookingItem: { bookingId: stale.id } } })).toBe(0);

    // A hold never consumed a seat, so releasing one changes no counter.
    const { confirmedCount } = await expectSeatCountsConsistent(db, trialClass.id);
    expect(confirmedCount).toBe(0);
  });

  it('leaves a live selection alone', async () => {
    const trialClass = await createClass(db, { capacity: 4, startsAt: inDays(7) });
    const live = await createBooking(db, { studentIds: [alyaId], classId: trialClass.id });

    expect(await expireHolds(db)).toEqual({ bookings: 0 });
    expect((await db.booking.findUniqueOrThrow({ where: { id: live.id } })).status).toBe('pending_payment');
  });

  it('retires a selection whose class has started, even inside its timer', async () => {
    const trialClass = await createClass(db, { capacity: 4, startsAt: inDays(-1) });
    const stale = await createBooking(db, {
      studentIds: [alyaId],
      classId: trialClass.id,
      expiresAt: minutesFromNow(60),
    });

    expect(await expireHolds(db)).toEqual({ bookings: 1 });
    expect((await db.booking.findUniqueOrThrow({ where: { id: stale.id } })).status).toBe('cancelled');
  });

  it('never touches a booking that was paid for, however old its timer', async () => {
    const trialClass = await createClass(db, { capacity: 4, startsAt: inDays(7) });
    const res = await api.post('/api/bookings', { classId: trialClass.id, studentIds: [alyaId] }, nadiaCookie);
    const { booking } = await res.json();
    await api.post(`/api/bookings/${booking.id}/pay`, { card: GOOD_CARD }, nadiaCookie);
    await db.booking.update({ where: { id: booking.id }, data: { expiresAt: minutesFromNow(-1) } });

    expect(await expireHolds(db)).toEqual({ bookings: 0 });
    expect((await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe('confirmed');
    const { confirmedCount } = await expectSeatCountsConsistent(db, trialClass.id);
    expect(confirmedCount).toBe(1);
  });

  it('is idempotent — a second run changes nothing', async () => {
    const trialClass = await createClass(db, { capacity: 4, startsAt: inDays(7) });
    await createBooking(db, {
      studentIds: [alyaId],
      classId: trialClass.id,
      expiresAt: minutesFromNow(-1),
    });

    expect(await expireHolds(db)).toEqual({ bookings: 1 });
    expect(await expireHolds(db)).toEqual({ bookings: 0 });
  });

  it('loses to a payment that got there first', async () => {
    const trialClass = await createClass(db, { capacity: 4, startsAt: inDays(7) });
    const res = await api.post('/api/bookings', { classId: trialClass.id, studentIds: [alyaId] }, nadiaCookie);
    const { booking } = await res.json();
    await api.post(`/api/bookings/${booking.id}/pay`, { card: GOOD_CARD }, nadiaCookie);
    await db.booking.update({ where: { id: booking.id }, data: { expiresAt: minutesFromNow(-1) } });

    // Both the sweep and the pay path claim Booking.status; whoever writes first wins.
    await expireHolds(db);

    const stored = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(stored.status).toBe('confirmed');
    await expectSeatCountsConsistent(db, trialClass.id);
  });
});
