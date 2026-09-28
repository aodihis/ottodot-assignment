import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { wipeAll } from '../../src/helpers/reset';
import { loginAs, sessionCookie } from '../helpers/api';
import { createTestApp } from '../helpers/app';
import { createUser, TEST_PASSWORD } from '../helpers/fixtures';

const { db, app, api } = createTestApp();

afterAll(async () => {
  await db.$disconnect();
});

beforeEach(async () => {
  await wipeAll(db);
});

describe('POST /api/auth/register', () => {
  it('creates a parent, normalises the email, and signs them in', async () => {
    const res = await api.post('/api/auth/register', {
      email: '  New@Example.COM ',
      password: TEST_PASSWORD,
      name: '  New Parent ',
    });

    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.user).toEqual({
      id: expect.any(String),
      email: 'new@example.com',
      name: 'New Parent',
      role: 'parent',
    });
    expect(JSON.stringify(body)).not.toContain('passwordHash');

    const me = await api.get('/api/auth/me', sessionCookie(res));
    expect(me.status).toBe(200);
    expect((await me.json()).user.email).toBe('new@example.com');
  });

  it('gives the new account a parent record and an empty child list', async () => {
    const res = await api.post('/api/auth/register', {
      email: 'fresh@example.com',
      password: TEST_PASSWORD,
      name: 'Fresh',
    });

    const body = await (await api.get('/api/auth/me', sessionCookie(res))).json();
    expect(body.parent).not.toBeNull();
    expect(body.students).toEqual([]);
  });

  it('refuses an email that is already registered', async () => {
    await api.post('/api/auth/register', {
      email: 'taken@example.com',
      password: TEST_PASSWORD,
      name: 'First',
    });

    const res = await api.post('/api/auth/register', {
      email: 'taken@example.com',
      password: TEST_PASSWORD,
      name: 'Second',
    });

    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('EMAIL_TAKEN');
  });

  it('treats a differently-cased email as the same account', async () => {
    await api.post('/api/auth/register', {
      email: 'Case@example.com',
      password: TEST_PASSWORD,
      name: 'First',
    });

    const res = await api.post('/api/auth/register', {
      email: 'case@EXAMPLE.com',
      password: TEST_PASSWORD,
      name: 'Second',
    });

    expect(res.status).toBe(409);
  });

  it('ignores a role supplied in the body, so nobody can self-register as admin', async () => {
    const res = await api.post('/api/auth/register', {
      email: 'sneaky@example.com',
      password: TEST_PASSWORD,
      name: 'Sneaky',
      role: 'admin',
    });

    expect(res.status).toBe(201);
    expect((await res.json()).user.role).toBe('parent');

    const stored = await db.user.findUnique({ where: { email: 'sneaky@example.com' } });
    expect(stored?.role).toBe('parent');
  });

  it('rejects a short password and a malformed email', async () => {
    const shortPassword = await api.post('/api/auth/register', {
      email: 'a@example.com',
      password: 'short',
      name: 'A',
    });
    expect(shortPassword.status).toBe(422);
    expect((await shortPassword.json()).error.code).toBe('VALIDATION_ERROR');

    const badEmail = await api.post('/api/auth/register', {
      email: 'not-an-email',
      password: TEST_PASSWORD,
      name: 'A',
    });
    expect(badEmail.status).toBe(422);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await createUser(db, { email: 'nadia@test.dev', name: 'Nadia', students: ['Alya'] });
  });

  it('signs in with the right password', async () => {
    const res = await api.post('/api/auth/login', {
      email: 'nadia@test.dev',
      password: TEST_PASSWORD,
    });

    expect(res.status).toBe(200);
    expect((await res.json()).user.email).toBe('nadia@test.dev');
    expect(sessionCookie(res)).toMatch(/^session=/);
  });

  it('answers the same way for a wrong password and an unknown email', async () => {
    const wrongPassword = await api.post('/api/auth/login', {
      email: 'nadia@test.dev',
      password: 'not-the-password',
    });
    const unknownEmail = await api.post('/api/auth/login', {
      email: 'nobody@test.dev',
      password: TEST_PASSWORD,
    });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect((await wrongPassword.json()).error.code).toBe('INVALID_CREDENTIALS');
    expect((await unknownEmail.json()).error.code).toBe('INVALID_CREDENTIALS');
  });

  it('logs out by clearing the cookie', async () => {
    const res = await api.post('/api/auth/logout');

    expect(res.status).toBe(204);
    expect(res.headers.get('set-cookie')).toContain('session=');
  });
});

describe('session gating', () => {
  it('refuses every /api route except /api/auth/* without a session', async () => {
    expect((await api.get('/api/students')).status).toBe(401);
    expect((await api.get('/api/classes')).status).toBe(401);
    expect((await api.get('/api/admin/classes')).status).toBe(401);

    const gated = await api.get('/api/classes');
    expect((await gated.json()).error.code).toBe('UNAUTHENTICATED');
  });

  it('refuses a tampered cookie', async () => {
    const res = await api.get('/api/classes', 'session=not.a.real.token');
    expect(res.status).toBe(401);
  });

  it('lets a parent read their own data but not the admin views', async () => {
    await createUser(db, { email: 'nadia@test.dev', name: 'Nadia', students: ['Alya'] });
    const cookie = await loginAs(db, 'nadia@test.dev');

    expect((await api.get('/api/students', cookie)).status).toBe(200);

    const admin = await api.get('/api/admin/classes', cookie);
    expect(admin.status).toBe(403);
    expect((await admin.json()).error.code).toBe('FORBIDDEN');
  });

  it('lets an admin read the admin views', async () => {
    await createUser(db, { email: 'admin@test.dev', name: 'Admin', role: 'admin' });
    const cookie = await loginAs(db, 'admin@test.dev');

    expect((await api.get('/api/admin/classes', cookie)).status).toBe(200);

    const own = await api.get('/api/students', cookie);
    expect(own.status).toBe(403);
  });
});
