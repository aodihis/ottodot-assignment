import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { wipeAll } from '../../src/helpers/reset';
import { loginAs } from '../helpers/api';
import { createTestApp } from '../helpers/app';
import { expectSeatCountsConsistent } from '../helpers/assertions';
import { createBooking, createClass, createUser, inDays, minutesFromNow } from '../helpers/fixtures';

const { db, app, api } = createTestApp();

const GOOD_CARD = { number: '4242 4242 4242 4242', holder: 'Nadia' };
const DECLINED_CARD = { number: '4000 0000 0000 0002', holder: 'Nadia' };

let nadiaCookie: string;
let rizkyCookie: string;
let alyaId: string;
let bimaId: string;
let citraId: string;
let dewiId: string;
let spareIds: string[];

/** Creates a booking through the API and returns the parsed `booking`. */
async function book(studentIds: string[], classId: string, cookie = nadiaCookie) {
  const res = await api.post('/api/bookings', { classId, studentIds }, cookie);
  return { res, body: await res.json() };
}

beforeEach(async () => {
  await wipeAll(db);

  const nadia = await createUser(db, { email: 'nadia@test.dev', name: 'Nadia', students: ['Alya', 'Bima'] });
  const rizky = await createUser(db, { email: 'rizky@test.dev', name: 'Rizky', students: ['Citra', 'Dewi'] });
  const sari = await createUser(db, { email: 'sari@test.dev', name: 'Sari', students: ['Eka', 'Fajar', 'Gita'] });

  alyaId = nadia.parent!.students.find((s) => s.name === 'Alya')!.id;
  bimaId = nadia.parent!.students.find((s) => s.name === 'Bima')!.id;
  citraId = rizky.parent!.students.find((s) => s.name === 'Citra')!.id;
  dewiId = rizky.parent!.students.find((s) => s.name === 'Dewi')!.id;
  spareIds = sari.parent!.students.map((student) => student.id);

  nadiaCookie = await loginAs(db, 'nadia@test.dev');
  rizkyCookie = await loginAs(db, 'rizky@test.dev');
});

/**
 * Occupies seats the honest way — real confirmed bookings, which move the
 * counter. Setting `confirmedCount` by hand is precisely the drift that
 * `expectSeatCountsConsistent` exists to catch.
 */
async function seatsTaken(classId: string, count: number) {
  for (const studentId of spareIds.slice(0, count)) {
    await createBooking(db, { studentIds: [studentId], classId, status: 'confirmed' });
  }
}

afterAll(async () => {
  await db.$disconnect();
});

describe('POST /api/bookings', () => {
  it('books one class for two children as a single order', async () => {
    const trialClass = await createClass(db, { capacity: 4, price: 50 });

    const { res, body } = await book([alyaId, bimaId], trialClass.id);

    expect(res.status).toBe(201);
    expect(body.message).toBe('Booking created');
    expect(body.booking.status).toBe('pending_payment');
    expect(body.booking.amount).toBe(100);
    expect(body.booking.currency).toBe('SGD');
    expect(body.booking.items).toHaveLength(2);
    expect(body.booking.items.map((i: { name: string }) => i.name).sort()).toEqual(['Alya', 'Bima']);
    expect(body.booking.items[0].price).toBe(50);

    // A selection consumes no seat: it is counted as pending, not as booked.
    const { confirmedCount } = await expectSeatCountsConsistent(db, trialClass.id);
    expect(confirmedCount).toBe(0);

    const classes = await (await api.get('/api/classes', nadiaCookie)).json();
    const view = classes.classes.find((c: { id: string }) => c.id === trialClass.id);
    expect(view.pendingHolds).toBe(2);
    expect(view.seatsAvailable).toBe(4);
  });

  it('expires its hold from BOOKING_HOLD_MINUTES, in UTC', async () => {
    const trialClass = await createClass(db, { startsAt: inDays(9) });
    const before = Date.now();

    const { body } = await book([alyaId], trialClass.id);

    const expiresAt = new Date(body.booking.expiresAt);
    expect(body.booking.expiresAt).toMatch(/Z$/);
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + 14 * 60_000);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 16 * 60_000);
  });

  it('refuses more children than there are seats, and writes nothing', async () => {
    const trialClass = await createClass(db, { capacity: 4, confirmedCount: 3 });

    const { res, body } = await book([alyaId, bimaId], trialClass.id);

    expect(res.status).toBe(409);
    expect(body.error.code).toBe('CLASS_FULL');
    expect(body.error.details).toMatchObject({ requested: 2, seatsAvailable: 1 });
    expect(await db.booking.count()).toBe(0);
  });

  it("refuses another parent's child", async () => {
    const trialClass = await createClass(db);

    const { res, body } = await book([citraId], trialClass.id);

    expect(res.status).toBe(403);
    expect(body.error.code).toBe('NOT_YOUR_STUDENT');
    expect(body.error.details.studentIds).toEqual([citraId]);
  });

  it('404s for a child that does not exist', async () => {
    const trialClass = await createClass(db);

    const { res, body } = await book(['child_nope'], trialClass.id);

    expect(res.status).toBe(404);
    expect(body.error.code).toBe('STUDENT_NOT_FOUND');
  });

  it('refuses a child that was removed', async () => {
    const trialClass = await createClass(db);
    await db.student.update({ where: { id: bimaId }, data: { removedAt: new Date() } });

    const { res, body } = await book([bimaId], trialClass.id);

    expect(res.status).toBe(403);
    expect(body.error.code).toBe('NOT_YOUR_STUDENT');
  });

  it('rejects the same child twice in one request', async () => {
    const trialClass = await createClass(db);

    const { res, body } = await book([alyaId, alyaId], trialClass.id);

    expect(res.status).toBe(422);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('refuses a second selection while one is live, and names the child', async () => {
    const trialClass = await createClass(db);
    await book([alyaId], trialClass.id);

    const { res, body } = await book([alyaId, bimaId], trialClass.id);

    expect(res.status).toBe(409);
    expect(body.error.code).toBe('DUPLICATE_ACTIVE_BOOKING');
    expect(body.error.details.studentIds).toEqual([alyaId]);
  });

  it('refuses a booking for a child who is already registered in that class', async () => {
    const trialClass = await createClass(db, { capacity: 4, startsAt: inDays(9) });
    const first = await book([alyaId], trialClass.id);
    await api.post(`/api/bookings/${first.body.booking.id}/pay`, { card: GOOD_CARD }, nadiaCookie);

    const again = await book([alyaId], trialClass.id);

    expect(again.res.status).toBe(409);
    expect(again.body.error.code).toBe('DUPLICATE_ACTIVE_BOOKING');
    expect(again.body.error.details.studentIds).toEqual([alyaId]);
  });

  it('retires a lapsed selection instead of treating it as active', async () => {
    const trialClass = await createClass(db);
    const stale = await book([alyaId], trialClass.id);
    await db.booking.update({
      where: { id: stale.body.booking.id },
      data: { expiresAt: minutesFromNow(-1) },
    });

    const { res } = await book([alyaId], trialClass.id);

    expect(res.status).toBe(201);
    const retired = await db.booking.findUniqueOrThrow({ where: { id: stale.body.booking.id } });
    expect(retired.status).toBe('cancelled');
    expect(retired.cancelledReason).toBe('expired');
  });

  it('refuses a class that has already started', async () => {
    const trialClass = await createClass(db, { startsAt: inDays(-1) });

    const { res, body } = await book([alyaId], trialClass.id);

    expect(res.status).toBe(409);
    expect(body.error.code).toBe('CLASS_ALREADY_STARTED');
  });

  it('refuses a class that does not exist', async () => {
    expect((await book([alyaId], 'class_nope')).res.status).toBe(404);
  });
});

describe('POST /api/bookings/:id/pay', () => {
  it('books the seats for a whole order, and records one charge for it', async () => {
    const trialClass = await createClass(db, { capacity: 4, price: 50 });
    const { body } = await book([alyaId, bimaId], trialClass.id);

    const res = await api.post(`/api/bookings/${body.booking.id}/pay`, { card: GOOD_CARD }, nadiaCookie);
    const paid = await res.json();

    expect(res.status).toBe(200);
    expect(paid.booking.status).toBe('confirmed');
    expect(paid.booking.items.map((i: { price: number }) => i.price)).toEqual([50, 50]);
    expect(paid.payment).toMatchObject({ type: 'charge', status: 'succeeded', amount: 100 });
    expect(paid.payment.card).toEqual({ brand: 'visa', last4: '4242', holder: 'Nadia' });

    // Paying is what registers the children.
    expect(await db.enrollment.count({ where: { classId: trialClass.id } })).toBe(2);

    const { confirmedCount, enrolled } = await expectSeatCountsConsistent(db, trialClass.id);
    expect(confirmedCount).toBe(2);
    expect(enrolled).toBe(2);
    expect(await db.payment.count({ where: { bookingId: body.booking.id } })).toBe(1);
  });

  it('never puts the card number in the response', async () => {
    const trialClass = await createClass(db);
    const { body } = await book([alyaId], trialClass.id);

    const res = await api.post(`/api/bookings/${body.booking.id}/pay`, { card: GOOD_CARD }, nadiaCookie);
    const paid = await res.json();

    expect(JSON.stringify(paid)).not.toContain('4242424242424242');
    // The stored card object is the only place a card could leak; references and
    // ids legitimately contain digit runs, so the check is scoped to it.
    expect(JSON.stringify(paid.payment.card)).not.toMatch(/\d{5,}/);
    expect(paid.payment.card.last4).toBe('4242');
    expect(Object.keys(paid.payment.card).sort()).toEqual(['brand', 'holder', 'last4']);
  });

  it('fails the whole booking when the seats went while it was being paid for', async () => {
    const trialClass = await createClass(db, { capacity: 4, price: 50 });
    // Selected while the class was empty, paid for after others took the seats —
    // which is the race a selection is exposed to, and why payment re-checks.
    const { body } = await book([alyaId, bimaId], trialClass.id);
    await seatsTaken(trialClass.id, 3);

    const res = await api.post(`/api/bookings/${body.booking.id}/pay`, { card: GOOD_CARD }, nadiaCookie);
    const failed = await res.json();

    expect(res.status).toBe(409);
    expect(failed.error.code).toBe('SEAT_TAKEN');
    expect(failed.error.details).toMatchObject({ requested: 2, seatsAvailable: 1 });
    expect(failed.error.details.payment).toMatchObject({ status: 'failed', failureReason: 'seat_taken' });

    const stored = await db.booking.findUniqueOrThrow({ where: { id: body.booking.id } });
    expect(stored.status).toBe('cancelled');
    expect(stored.cancelledReason).toBe('seat_taken');
    // Nothing was registered — the seats went to someone else.
    expect(await db.enrollment.count({ where: { bookingItem: { bookingId: body.booking.id } } })).toBe(0);

    await expectSeatCountsConsistent(db, trialClass.id);
    const charges = await db.payment.findMany({ where: { bookingId: body.booking.id } });
    expect(charges).toHaveLength(1);
    expect(charges[0].status).toBe('failed');
  });

  it('records a declined card, frees the selection, and lets the parent rebook', async () => {
    const trialClass = await createClass(db, { capacity: 4 });
    const { body } = await book([alyaId], trialClass.id);

    const res = await api.post(`/api/bookings/${body.booking.id}/pay`, { card: DECLINED_CARD }, nadiaCookie);
    const declined = await res.json();

    expect(res.status).toBe(402);
    expect(declined.error.code).toBe('CARD_DECLINED');
    expect(declined.error.details.reason).toBe('card_declined');

    const stored = await db.booking.findUniqueOrThrow({ where: { id: body.booking.id } });
    expect(stored.status).toBe('payment_failed');
    await expectSeatCountsConsistent(db, trialClass.id);

    const retry = await book([alyaId], trialClass.id);
    expect(retry.res.status).toBe(201);
  });

  it('rejects a malformed card before touching anything, so the same hold can still be paid', async () => {
    const trialClass = await createClass(db, { capacity: 4 });
    const { body } = await book([alyaId], trialClass.id);

    const bad = await api.post(
      `/api/bookings/${body.booking.id}/pay`,
      { card: { number: '4242 4242 4242 4241', holder: 'Nadia' } },
      nadiaCookie,
    );
    expect(bad.status).toBe(422);
    expect((await bad.json()).error.code).toBe('INVALID_CARD');

    const stillPending = await db.booking.findUniqueOrThrow({ where: { id: body.booking.id } });
    expect(stillPending.status).toBe('pending_payment');
    expect(await db.payment.count({ where: { bookingId: body.booking.id } })).toBe(0);

    const good = await api.post(`/api/bookings/${body.booking.id}/pay`, { card: GOOD_CARD }, nadiaCookie);
    expect(good.status).toBe(200);
    expect((await good.json()).booking.status).toBe('confirmed');
  });

  it('is idempotent on a second payment', async () => {
    const trialClass = await createClass(db, { capacity: 4 });
    const { body } = await book([alyaId], trialClass.id);

    await api.post(`/api/bookings/${body.booking.id}/pay`, { card: GOOD_CARD }, nadiaCookie);
    const again = await api.post(`/api/bookings/${body.booking.id}/pay`, { card: GOOD_CARD }, nadiaCookie);

    expect(again.status).toBe(200);
    expect((await again.json()).message).toMatch(/already paid/i);
    expect(await db.payment.count({ where: { bookingId: body.booking.id, status: 'succeeded' } })).toBe(1);
    await expectSeatCountsConsistent(db, trialClass.id);
  });

  it('charges once when two payments race for the same booking', async () => {
    const trialClass = await createClass(db, { capacity: 4 });
    const { body } = await book([alyaId], trialClass.id);

    await Promise.all([
      api.post(`/api/bookings/${body.booking.id}/pay`, { card: GOOD_CARD }, nadiaCookie),
      api.post(`/api/bookings/${body.booking.id}/pay`, { card: GOOD_CARD }, nadiaCookie),
    ]);

    expect(await db.payment.count({ where: { bookingId: body.booking.id, status: 'succeeded' } })).toBe(1);
    const { confirmedCount } = await expectSeatCountsConsistent(db, trialClass.id);
    expect(confirmedCount).toBe(1);
  });

  it('refuses a lapsed selection, and says so differently once it has been swept', async () => {
    const trialClass = await createClass(db, { capacity: 4 });
    const { body } = await book([alyaId], trialClass.id);
    await db.booking.update({
      where: { id: body.booking.id },
      data: { expiresAt: minutesFromNow(-1) },
    });

    const unswept = await api.post(`/api/bookings/${body.booking.id}/pay`, { card: GOOD_CARD }, nadiaCookie);
    expect(unswept.status).toBe(409);
    expect((await unswept.json()).error.code).toBe('BOOKING_EXPIRED');

    const { expireHolds } = await import('../../src/modules/bookings/bookings.service');
    await expireHolds(db);

    const swept = await api.post(`/api/bookings/${body.booking.id}/pay`, { card: GOOD_CARD }, nadiaCookie);
    expect(swept.status).toBe(409);
    expect((await swept.json()).error.code).toBe('BOOKING_NOT_PAYABLE');
  });

  it("refuses another parent's booking, and unknown bookings", async () => {
    const trialClass = await createClass(db);
    const { body } = await book([alyaId], trialClass.id);

    expect((await api.post(`/api/bookings/${body.booking.id}/pay`, { card: GOOD_CARD }, rizkyCookie)).status).toBe(403);
    expect((await api.post('/api/bookings/booking_nope/pay', { card: GOOD_CARD }, nadiaCookie)).status).toBe(404);
  });
});

describe('the last-seat race', () => {
  it('lets exactly one of two competing bookings take the last two seats', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const cookies = [nadiaCookie, rizkyCookie];
      const children = [
        [alyaId, bimaId],
        [citraId, dewiId],
      ];

      // Two seats free: one booking can win, and it is all-or-nothing.
      const trialClass = await createClass(db, { capacity: 4, price: 50 });
      await seatsTaken(trialClass.id, 2);

      const orders = await Promise.all(
        children.map(async (ids, index) => {
          const res = await api.post('/api/bookings', { classId: trialClass.id, studentIds: ids }, cookies[index]);
          return (await res.json()).booking.id as string;
        }),
      );

      const responses = await Promise.all(
        orders.map((id, index) =>
          api.post(`/api/bookings/${id}/pay`, { card: GOOD_CARD }, cookies[index]),
        ),
      );
      const statuses = responses.map((res) => res.status).sort();
      expect(statuses).toEqual([200, 409]);

      const winner = responses.find((res) => res.status === 200)!;
      const loser = responses.find((res) => res.status === 409)!;
      const loserBody = await loser.json();

      expect(loserBody.error.code).toBe('SEAT_TAKEN');
      expect(loserBody.error.details.seatsAvailable).toBe(0);

      // Counter and registrations agree, and exactly one order registered anyone.
      const { confirmedCount, enrolled } = await expectSeatCountsConsistent(db, trialClass.id);
      expect(confirmedCount).toBe(4);
      expect(enrolled).toBe(4);

      const enrolledPerOrder = await Promise.all(
        orders.map((id) => db.enrollment.count({ where: { bookingItem: { bookingId: id } } })),
      );
      expect(enrolledPerOrder[responses.indexOf(winner)]).toBe(2);
      expect(enrolledPerOrder[responses.indexOf(loser)]).toBe(0);
      expect(enrolledPerOrder.filter((count) => count > 0)).toHaveLength(1);

      // All-or-nothing: the loser keeps no partial booking, and was never charged.
      const loserOrder = await db.booking.findUniqueOrThrow({
        where: { id: orders[responses.indexOf(loser)] },
        include: { payments: true },
      });
      expect(loserOrder.status).toBe('cancelled');
      expect(loserOrder.payments).toHaveLength(1);
      expect(loserOrder.payments[0]).toMatchObject({ type: 'charge', status: 'failed', failureReason: 'seat_taken' });

      const winnerOrderId = orders[responses.indexOf(winner)];
      expect(await db.payment.count({ where: { bookingId: winnerOrderId, status: 'succeeded' } })).toBe(1);
      expect(await db.payment.count({ where: { type: 'refund' } })).toBe(0);
    }
  });

  it('leaves no partial booking when the losing side wants two seats and one is left', async () => {
    const trialClass = await createClass(db, { capacity: 3, price: 50 });
    await seatsTaken(trialClass.id, 1); // two seats left

    const small = await book([alyaId], trialClass.id);
    const large = await book([citraId, dewiId], trialClass.id, rizkyCookie);
    expect(large.res.status).toBe(201); // the friendly check passed at selection time

    expect((await api.post(`/api/bookings/${small.body.booking.id}/pay`, { card: GOOD_CARD }, nadiaCookie)).status).toBe(200);

    const res = await api.post(`/api/bookings/${large.body.booking.id}/pay`, { card: GOOD_CARD }, rizkyCookie);
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('SEAT_TAKEN');

    const { confirmedCount, enrolled } = await expectSeatCountsConsistent(db, trialClass.id);
    expect(confirmedCount).toBe(2); // the one pre-taken seat, plus the small booking
    expect(enrolled).toBe(2);

    // The two-seat booking registered nobody.
    expect(await db.enrollment.count({ where: { bookingItem: { bookingId: large.body.booking.id } } })).toBe(0);
  });
});

describe('POST /api/bookings/:id/cancel', () => {
  it('refunds a confirmed booking and puts its seats back', async () => {
    const trialClass = await createClass(db, { capacity: 4, price: 50, startsAt: inDays(9) });
    const { body } = await book([alyaId, bimaId], trialClass.id);
    await api.post(`/api/bookings/${body.booking.id}/pay`, { card: GOOD_CARD }, nadiaCookie);

    const res = await api.post(`/api/bookings/${body.booking.id}/cancel`, undefined, nadiaCookie);
    const cancelled = await res.json();

    expect(res.status).toBe(200);
    expect(cancelled.booking.status).toBe('cancelled');
    expect(cancelled.booking.cancelledReason).toBe('parent_cancelled');
    expect(cancelled.refund).toMatchObject({ type: 'refund', status: 'succeeded', amount: 100 });

    const { confirmedCount } = await expectSeatCountsConsistent(db, trialClass.id);
    expect(confirmedCount).toBe(0);

    const items = await db.bookingItem.findMany({ where: { bookingId: body.booking.id } });
    expect(items.every((item) => item.refundedAt !== null && item.refundAmount?.toFixed(2) === '50.00')).toBe(true);

    // Refunded means no longer registered: both children leave the roster.
    expect(await db.enrollment.count({ where: { bookingItem: { bookingId: body.booking.id } } })).toBe(0);
  });

  it('refunds exactly once when cancels race', async () => {
    const trialClass = await createClass(db, { capacity: 4, startsAt: inDays(9) });
    const { body } = await book([alyaId], trialClass.id);
    await api.post(`/api/bookings/${body.booking.id}/pay`, { card: GOOD_CARD }, nadiaCookie);

    await Promise.all([
      api.post(`/api/bookings/${body.booking.id}/cancel`, undefined, nadiaCookie),
      api.post(`/api/bookings/${body.booking.id}/cancel`, undefined, nadiaCookie),
    ]);

    expect(await db.payment.count({ where: { bookingId: body.booking.id, type: 'refund' } })).toBe(1);
    const { confirmedCount } = await expectSeatCountsConsistent(db, trialClass.id);
    expect(confirmedCount).toBe(0);
  });

  it('publishes canCancel that agrees with what the server will do', async () => {
    const trialClass = await createClass(db, { capacity: 4, startsAt: inDays(9) });
    const { body } = await book([alyaId], trialClass.id);
    await api.post(`/api/bookings/${body.booking.id}/pay`, { card: GOOD_CARD }, nadiaCookie);

    // The flag and the decision are one rule, so the UI cannot offer a cancel the
    // server refuses — or hide one it would accept.
    const before = await (await api.get(`/api/bookings/${body.booking.id}`, nadiaCookie)).json();
    expect(before.booking.canCancel).toBe(true);
    expect((await api.post(`/api/bookings/${body.booking.id}/cancel`, undefined, nadiaCookie)).status).toBe(200);

    const after = await (await api.get(`/api/bookings/${body.booking.id}`, nadiaCookie)).json();
    expect(after.booking.canCancel).toBe(false);
  });

  it('says canCancel false once the window has closed, and the server agrees', async () => {
    const trialClass = await createClass(db, { capacity: 4, startsAt: inDays(2) });
    const { body } = await book([alyaId], trialClass.id);
    await api.post(`/api/bookings/${body.booking.id}/pay`, { card: GOOD_CARD }, nadiaCookie);

    const view = await (await api.get(`/api/bookings/${body.booking.id}`, nadiaCookie)).json();
    expect(view.booking.canCancel).toBe(false);
    expect((await api.post(`/api/bookings/${body.booking.id}/cancel`, undefined, nadiaCookie)).status).toBe(409);
  });

  it('refuses to refund once the cancellation window has closed', async () => {
    const trialClass = await createClass(db, { capacity: 4, startsAt: inDays(2) });
    const { body } = await book([alyaId], trialClass.id);
    await api.post(`/api/bookings/${body.booking.id}/pay`, { card: GOOD_CARD }, nadiaCookie);

    const res = await api.post(`/api/bookings/${body.booking.id}/cancel`, undefined, nadiaCookie);

    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('CANCELLATION_WINDOW_CLOSED');
    expect(await db.payment.count({ where: { bookingId: body.booking.id, type: 'refund' } })).toBe(0);
    const { confirmedCount } = await expectSeatCountsConsistent(db, trialClass.id);
    expect(confirmedCount).toBe(1);
  });

  it('releases an unpaid selection without any refund', async () => {
    const trialClass = await createClass(db, { capacity: 4 });
    const { body } = await book([alyaId], trialClass.id);

    const res = await api.post(`/api/bookings/${body.booking.id}/cancel`, undefined, nadiaCookie);
    const cancelled = await res.json();

    expect(res.status).toBe(200);
    expect(cancelled.refund).toBeNull();
    expect(cancelled.booking.cancelledReason).toBe('parent_cancelled');
    expect(await db.payment.count({ where: { bookingId: body.booking.id } })).toBe(0);
  });

  it('frees the seat so the parent who lost it can now take it', async () => {
    const trialClass = await createClass(db, { capacity: 2, price: 50, startsAt: inDays(9) });
    await seatsTaken(trialClass.id, 1); // one seat left

    // Both select the last seat while it is still free — that is the scenario.
    const first = await book([alyaId], trialClass.id);
    const late = await book([citraId], trialClass.id, rizkyCookie);
    expect(late.res.status).toBe(201);

    await api.post(`/api/bookings/${first.body.booking.id}/pay`, { card: GOOD_CARD }, nadiaCookie);

    const lost = await api.post(`/api/bookings/${late.body.booking.id}/pay`, { card: GOOD_CARD }, rizkyCookie);
    expect(lost.status).toBe(409);
    expect((await lost.json()).error.code).toBe('SEAT_TAKEN');

    await api.post(`/api/bookings/${first.body.booking.id}/cancel`, undefined, nadiaCookie);

    const retry = await book([citraId], trialClass.id, rizkyCookie);
    expect(retry.res.status).toBe(201);
    expect((await api.post(`/api/bookings/${retry.body.booking.id}/pay`, { card: GOOD_CARD }, rizkyCookie)).status).toBe(200);
    await expectSeatCountsConsistent(db, trialClass.id);
  });
});

describe('GET /api/bookings/:id', () => {
  it('requires a session on the collection as well as on one booking', async () => {
    const trialClass = await createClass(db);

    // The collection matters: the parent gate is mounted on `/bookings/*`, which
    // is also what covers the bare path.
    expect((await api.post('/api/bookings', { classId: trialClass.id, studentIds: [alyaId] })).status).toBe(401);
    expect((await api.get('/api/bookings/whatever')).status).toBe(401);
  });

  it('returns the booking for its owner only', async () => {
    const trialClass = await createClass(db);
    const { body } = await book([alyaId], trialClass.id);

    const mine = await api.get(`/api/bookings/${body.booking.id}`, nadiaCookie);
    expect(mine.status).toBe(200);
    expect((await mine.json()).booking.items).toHaveLength(1);

    expect((await api.get(`/api/bookings/${body.booking.id}`, rizkyCookie)).status).toBe(403);
    expect((await api.get(`/api/bookings/${body.booking.id}`)).status).toBe(401);
  });
});
