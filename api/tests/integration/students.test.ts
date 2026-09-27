import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { wipeAll } from '../../src/helpers/reset';
import { loginAs } from '../helpers/api';
import { createTestApp } from '../helpers/app';
import { childNamed, createBooking, createClass, createUser, inDays } from '../helpers/fixtures';

const { db, app, api } = createTestApp();

let nadiaCookie: string;
let adminCookie: string;

afterAll(async () => {
  await db.$disconnect();
});

beforeEach(async () => {
  await wipeAll(db);

  await createUser(db, { email: 'nadia@test.dev', name: 'Nadia', students: ['Alya', 'Bima'] });
  await createUser(db, { email: 'rizky@test.dev', name: 'Rizky', students: ['Citra'] });
  await createUser(db, { email: 'admin@test.dev', name: 'Admin', role: 'admin' });

  nadiaCookie = await loginAs(app, 'nadia@test.dev');
  adminCookie = await loginAs(app, 'admin@test.dev');
});

describe('GET /api/students', () => {
  it("lists only the session parent's children", async () => {
    const res = await api.get('/api/students', nadiaCookie);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.students.map((s: { name: string }) => s.name)).toEqual(['Alya', 'Bima']);
  });

  it('leaves out a child that was removed', async () => {
    const alya = await childNamed(db, 'Alya');
    await db.student.update({ where: { id: alya.id }, data: { removedAt: new Date() } });

    const body = await (await api.get('/api/students', nadiaCookie)).json();
    expect(body.students.map((s: { name: string }) => s.name)).toEqual(['Bima']);
  });
});

describe('POST /api/students', () => {
  it('adds a child to the session parent', async () => {
    const res = await api.post('/api/students', { name: '  Dita  ' }, nadiaCookie);

    expect(res.status).toBe(201);
    expect((await res.json()).student.name).toBe('Dita');

    const listed = await (await api.get('/api/students', nadiaCookie)).json();
    expect(listed.students.map((s: { name: string }) => s.name)).toEqual(['Alya', 'Bima', 'Dita']);
  });

  it('rejects a blank name', async () => {
    const res = await api.post('/api/students', { name: '   ' }, nadiaCookie);

    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe('VALIDATION_ERROR');
  });

  it('refuses an admin, who has no children of their own', async () => {
    expect((await api.post('/api/students', { name: 'X' }, adminCookie)).status).toBe(403);
  });

  it('requires a session', async () => {
    expect((await api.post('/api/students', { name: 'X' })).status).toBe(401);
  });
});

describe('DELETE /api/students/:id', () => {
  it('soft-deletes the child and hides them from the list', async () => {
    const alya = await childNamed(db, 'Alya');

    const res = await api.delete(`/api/students/${alya.id}`, nadiaCookie);
    expect(res.status).toBe(204);

    const listed = await (await api.get('/api/students', nadiaCookie)).json();
    expect(listed.students.map((s: { name: string }) => s.name)).toEqual(['Bima']);

    // Soft delete: the row survives so past rosters still resolve a name.
    const row = await db.student.findUnique({ where: { id: alya.id } });
    expect(row?.removedAt).toBeInstanceOf(Date);
  });

  it("refuses another parent's child", async () => {
    const citra = await childNamed(db, 'Citra');

    const res = await api.delete(`/api/students/${citra.id}`, nadiaCookie);
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('NOT_YOUR_STUDENT');
  });

  it('404s for an unknown id and for a second delete', async () => {
    const alya = await childNamed(db, 'Alya');

    expect((await api.delete('/api/students/does-not-exist', nadiaCookie)).status).toBe(404);
    expect((await api.delete(`/api/students/${alya.id}`, nadiaCookie)).status).toBe(204);
    expect((await api.delete(`/api/students/${alya.id}`, nadiaCookie)).status).toBe(404);
  });

  it('refuses while the child holds a seat (pending hold)', async () => {
    const alya = await childNamed(db, 'Alya');
    const trialClass = await createClass(db, { startsAt: inDays(7) });
    await createBooking(db, {
      studentId: alya.id,
      classId: trialClass.id,
      status: 'pending_payment',
      expiresAt: new Date(Date.now() + 10 * 60_000),
    });

    const res = await api.delete(`/api/students/${alya.id}`, nadiaCookie);
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('STUDENT_HAS_ACTIVE_BOOKING');
  });

  it('refuses while the child has a confirmed booking on an upcoming class', async () => {
    const alya = await childNamed(db, 'Alya');
    const trialClass = await createClass(db, { startsAt: inDays(7) });
    await createBooking(db, {
      studentId: alya.id,
      classId: trialClass.id,
      status: 'confirmed',
      confirmedAt: new Date(),
    });

    expect((await api.delete(`/api/students/${alya.id}`, nadiaCookie)).status).toBe(409);
  });

  it('allows removal when the only confirmed booking is on a past class', async () => {
    const alya = await childNamed(db, 'Alya');
    const pastClass = await createClass(db, { startsAt: inDays(-3) });
    await createBooking(db, {
      studentId: alya.id,
      classId: pastClass.id,
      status: 'confirmed',
      confirmedAt: inDays(-10),
    });

    expect((await api.delete(`/api/students/${alya.id}`, nadiaCookie)).status).toBe(204);
  });

  it('allows removal when the only hold has already expired', async () => {
    const alya = await childNamed(db, 'Alya');
    const trialClass = await createClass(db, { startsAt: inDays(7) });
    await createBooking(db, {
      studentId: alya.id,
      classId: trialClass.id,
      status: 'pending_payment',
      expiresAt: new Date(Date.now() - 60_000),
    });

    expect((await api.delete(`/api/students/${alya.id}`, nadiaCookie)).status).toBe(204);
  });

  it('requires a session', async () => {
    const alya = await childNamed(db, 'Alya');
    expect((await api.delete(`/api/students/${alya.id}`)).status).toBe(401);
  });
});
