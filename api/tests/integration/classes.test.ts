import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { wipeAll } from '../../src/helpers/reset';
import { loginAs } from '../helpers/api';
import { createTestApp } from '../helpers/app';
import { childNamed, createBooking, createClass, createUser, DAY, inDays } from '../helpers/fixtures';

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

  parentCookie = await loginAs(app, 'nadia@test.dev');
  adminCookie = await loginAs(app, 'admin@test.dev');
});

describe('GET /api/classes', () => {
  it('requires a session', async () => {
    expect((await api.get('/api/classes')).status).toBe(401);
  });

  it('reports seats left, live holds, and the cancellation deadline', async () => {
    const startsAt = inDays(9);
    const trialClass = await createClass(db, {
      title: 'Fractions',
      startsAt,
      capacity: 4,
      confirmedCount: 3,
    });

    const alya = await childNamed(db, 'Alya');

    // two live holds...
    for (let i = 0; i < 2; i += 1) {
      await createBooking(db, {
        studentId: alya.id,
        classId: trialClass.id,
        status: 'pending_payment',
        expiresAt: new Date(Date.now() + 10 * 60_000),
      });
    }
    // ...and one that has already lapsed, which must not be counted
    await createBooking(db, {
      studentId: alya.id,
      classId: trialClass.id,
      status: 'pending_payment',
      expiresAt: new Date(Date.now() - 60_000),
    });

    const body = await (await api.get('/api/classes', parentCookie)).json();
    const view = body.classes.find((c: { id: string }) => c.id === trialClass.id);

    expect(view.seatsAvailable).toBe(1);
    expect(view.pendingHolds).toBe(2);
    expect(view.confirmedCount).toBe(3);
    expect(view.capacity).toBe(4);
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

  it('shows the confirmed roster, live holds, and refunded cancellations', async () => {
    const trialClass = await createClass(db, { title: 'Simple Machines', confirmedCount: 1 });
    const alya = await childNamed(db, 'Alya');
    const rizky = await createUser(db, {
      email: 'rizky@test.dev',
      name: 'Rizky',
      students: ['Citra'],
    });
    const citra = rizky.parent!.students[0];

    await createBooking(db, {
      studentId: alya.id,
      classId: trialClass.id,
      status: 'confirmed',
      confirmedAt: inDays(-1),
    });
    await createBooking(db, {
      studentId: citra.id,
      classId: trialClass.id,
      status: 'pending_payment',
      expiresAt: new Date(Date.now() + 10 * 60_000),
    });
    await createBooking(db, {
      studentId: citra.id,
      classId: trialClass.id,
      status: 'cancelled',
      cancelledReason: 'parent_cancelled',
      refundedAt: new Date(),
      refundCents: 5000,
    });

    const res = await api.get(`/api/admin/classes/${trialClass.id}/roster`, adminCookie);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.class.title).toBe('Simple Machines');
    expect(body.roster).toHaveLength(1);
    expect(body.roster[0]).toMatchObject({ name: 'Alya', parentName: 'Nadia' });
    expect(body.pendingHolds.map((h: { name: string }) => h.name)).toEqual(['Citra']);
    expect(body.cancelled).toHaveLength(1);
    expect(body.cancelled[0]).toMatchObject({ name: 'Citra', refundCents: 5000 });
  });
});
