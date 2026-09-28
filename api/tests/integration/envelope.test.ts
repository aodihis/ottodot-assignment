import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { wipeAll } from '../../src/helpers/reset';
import { loginAs } from '../helpers/api';
import { createTestApp } from '../helpers/app';
import { createClass, createUser, minutesFromNow } from '../helpers/fixtures';

const { db, app, api } = createTestApp();

let parentCookie: string;
let adminCookie: string;

beforeEach(async () => {
  await wipeAll(db);

  await createUser(db, { email: 'nadia@test.dev', name: 'Nadia', students: ['Alya'] });
  await createUser(db, { email: 'admin@test.dev', name: 'Admin', role: 'admin' });

  parentCookie = await loginAs(db, 'nadia@test.dev');
  adminCookie = await loginAs(db, 'admin@test.dev');
});

afterAll(async () => {
  await db.$disconnect();
});

/**
 * One guard over every mounted route: successes carry a `message` plus their
 * named keys, failures carry `{message, error:{code}}`. It exists because the
 * envelope is a cross-cutting rule, and the cheapest way to break it is to add
 * one endpoint and forget.
 */
describe('every response uses the same envelope', () => {
  it('successes carry a message and their named payload', async () => {
    const trialClass = await createClass(db, { capacity: 4 });

    const student = await db.student.findFirstOrThrow();
    const created = await api.post('/api/bookings', { classId: trialClass.id, studentIds: [student.id] }, parentCookie);
    // A Response body can only be read once, so this one is asserted here rather
    // than joining the loop below.
    const createdBody = await created.json();
    expect(created.status).toBe(201);
    expect(typeof createdBody.message).toBe('string');
    expect(createdBody.error).toBeUndefined();

    const calls: Array<[string, number, Awaited<ReturnType<typeof api.get>>]> = [
      ['POST /api/auth/login', 200, await api.post('/api/auth/login', { email: 'nadia@test.dev', password: 'password123' })],
      ['GET /api/auth/me', 200, await api.get('/api/auth/me', parentCookie)],
      ['GET /api/students', 200, await api.get('/api/students', parentCookie)],
      ['GET /api/classes', 200, await api.get('/api/classes', parentCookie)],
      ['GET /api/admin/classes', 200, await api.get('/api/admin/classes', adminCookie)],
      ['GET /api/admin/classes/:id/roster', 200, await api.get(`/api/admin/classes/${trialClass.id}/roster`, adminCookie)],
      ['GET /api/bookings/:id', 200, await api.get(`/api/bookings/${createdBody.booking.id}`, parentCookie)],
    ];

    for (const [label, status, response] of calls) {
      expect(response.status, label).toBe(status);

      const body = await response.json();
      expect(typeof body.message, label).toBe('string');
      expect(body.message.length, label).toBeGreaterThan(0);
      expect(body.error, label).toBeUndefined();
      expect(Object.keys(body).length, label).toBeGreaterThan(1);
    }
  });

  it('a created resource is 201 with the same shape', async () => {
    const res = await api.post('/api/students', { name: 'Bima' }, parentCookie);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(typeof body.message).toBe('string');
    expect(body.student.name).toBe('Bima');
  });

  it('failures carry a message and a nested code, at the right status', async () => {
    const trialClass = await createClass(db, { capacity: 4, startsAt: minutesFromNow(-1) });
    const student = await db.student.findFirstOrThrow();

    const calls: Array<[string, number, string, Awaited<ReturnType<typeof api.get>>]> = [
      ['unauthenticated', 401, 'UNAUTHENTICATED', await api.get('/api/classes')],
      ['bad login', 401, 'INVALID_CREDENTIALS', await api.post('/api/auth/login', { email: 'nadia@test.dev', password: 'wrong' })],
      ['parent on admin', 403, 'FORBIDDEN', await api.get('/api/admin/classes', parentCookie)],
      ['unknown class', 404, 'CLASS_NOT_FOUND', await api.get('/api/admin/classes/nope/roster', adminCookie)],
      ['unknown booking', 404, 'BOOKING_NOT_FOUND', await api.get('/api/bookings/nope', parentCookie)],
      ['class started', 409, 'CLASS_ALREADY_STARTED', await api.post('/api/bookings', { classId: trialClass.id, studentIds: [student.id] }, parentCookie)],
      ['validation', 422, 'VALIDATION_ERROR', await api.post('/api/students', { name: '   ' }, parentCookie)],
    ];

    for (const [label, status, code, response] of calls) {
      expect(response.status, label).toBe(status);

      const body = await response.json();
      expect(typeof body.message, label).toBe('string');
      expect(body.error?.code, label).toBe(code);
      expect(body.data, label).toBeUndefined();
      expect(body.error.payload, label).toBeUndefined();
    }
  });

  it('answers a body that is not JSON as a client error, not a server one', async () => {
    // A raw request, because the test client always serialises its body.
    const res = await app.request('/api/students', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: parentCookie },
      body: 'not json at all',
    });
    const body = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('MALFORMED_JSON');
  });

  it('carries validation detail without hiding it behind the code', async () => {
    const res = await api.post('/api/students', { name: '' }, parentCookie);
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details.issues.length).toBeGreaterThan(0);
    expect(body.message).toMatch(/name/i);
  });
});
