import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { wipeAll } from '../../src/helpers/reset';
import { loginAs } from '../helpers/api';
import { createTestApp } from '../helpers/app';
import {
  childNamed,
  createBooking,
  createClass,
  createUser,
  DAY,
  inDays,
  minutesFromNow,
} from '../helpers/fixtures';

const { db, app, api } = createTestApp();

let parentCookie: string;
let adminCookie: string;

afterAll(async () => {
  await db.$disconnect();
});

beforeEach(async () => {
  await wipeAll(db);

  await createUser(db, { email: 'nadia@test.dev', name: 'Nadia', students: ['Alya'] });
  await createUser(db, { email: 'admin@test.dev', name: 'Admin', role: 'admin' });

  parentCookie = await loginAs(db, 'nadia@test.dev');
  adminCookie = await loginAs(db, 'admin@test.dev');
});

describe('GET /api/classes', () => {
  it('requires a session', async () => {
    expect((await api.get('/api/classes')).status).toBe(401);
  });

  it('reports seats left, live selections, and the cancellation deadline', async () => {
    const startsAt = inDays(9);
    const trialClass = await createClass(db, {
      title: 'Fractions',
      startsAt,
      capacity: 4,
      confirmedCount: 3,
    });

    const alya = await childNamed(db, 'Alya');

    // two live selections...
    for (let i = 0; i < 2; i += 1) {
      await createBooking(db, {
        studentIds: [alya.id],
        classId: trialClass.id,
        expiresAt: minutesFromNow(10),
      });
    }
    // ...and one that has lapsed, which must not be counted
    await createBooking(db, {
      studentIds: [alya.id],
      classId: trialClass.id,
      expiresAt: minutesFromNow(-1),
    });

    const body = await (await api.get('/api/classes', parentCookie)).json();
    const view = body.classes.find((c: { id: string }) => c.id === trialClass.id);

    expect(view.seatsAvailable).toBe(1);
    expect(view.pendingHolds).toBe(2);
    expect(view.confirmedCount).toBe(3);
    expect(view.capacity).toBe(4);
    expect(view.price).toBe(50);
    expect(new Date(view.cancellationDeadline).toISOString()).toBe(
      new Date(startsAt.getTime() - 5 * DAY).toISOString(),
    );
  });

  it('lists classes by start time', async () => {
    await createClass(db, { title: 'Later', startsAt: inDays(10) });
    await createClass(db, { title: 'Sooner', startsAt: inDays(2) });

    const body = await (await api.get('/api/classes', parentCookie)).json();

    expect(body.classes.map((c: { title: string }) => c.title)).toEqual(['Sooner', 'Later']);
  });
});

describe('GET /api/admin/classes/:id/roster', () => {
  it('refuses a parent', async () => {
    const trialClass = await createClass(db);

    const res = await api.get(`/api/admin/classes/${trialClass.id}/roster`, parentCookie);
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('FORBIDDEN');
  });

  it('404s for an unknown class', async () => {
    expect((await api.get('/api/admin/classes/nope/roster', adminCookie)).status).toBe(404);
  });

  it('shows the booked roster, live selections, and refunded cancellations', async () => {
    const trialClass = await createClass(db, { title: 'Simple Machines' });
    const alya = await childNamed(db, 'Alya');
    const rizky = await createUser(db, {
      email: 'rizky@test.dev',
      name: 'Rizky',
      students: ['Citra'],
    });
    const citra = rizky.parent!.students[0];

    // A confirmed booking registers the child and takes the seat, in one step.
    await createBooking(db, { studentIds: [alya.id], classId: trialClass.id, status: 'confirmed' });
    await createBooking(db, {
      studentIds: [citra.id],
      classId: trialClass.id,
      expiresAt: minutesFromNow(10),
    });
    await createBooking(db, {
      studentIds: [citra.id],
      classId: trialClass.id,
      status: 'cancelled',
      cancelledReason: 'parent_cancelled',
      refundedAt: new Date(),
      refundAmount: 50,
    });

    const res = await api.get(`/api/admin/classes/${trialClass.id}/roster`, adminCookie);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.class.title).toBe('Simple Machines');
    expect(body.class.description).toBeNull();
    // The roster is a list of registrations, each traceable to its booking.
    expect(body.roster).toHaveLength(1);
    expect(body.roster[0]).toMatchObject({ name: 'Alya', parentName: 'Nadia' });
    expect(body.roster[0].enrollmentId).toEqual(expect.any(String));
    expect(body.roster[0].bookingId).toEqual(expect.any(String));
    expect(body.pendingHolds.map((h: { name: string }) => h.name)).toEqual(['Citra']);
    expect(body.refunded).toHaveLength(1);
    expect(body.refunded[0]).toMatchObject({ name: 'Citra', refundAmount: 50 });
  });
});
