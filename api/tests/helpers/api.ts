import type { Hono } from 'hono';
import { sign } from 'hono/jwt';
import type { Env } from '../../src/app';
import type { Db } from '../../src/db';
import { sessionSecret } from '../../src/helpers/config';
import { SESSION_COOKIE } from '../../src/modules/auth/session';
import { TEST_PASSWORD } from './fixtures';

/**
 * Node types `Response.json()` as `unknown`, which makes every assertion in a
 * test poke an unknown. Test payloads are read for their shape, so let them be
 * `any` here rather than casting at each call site.
 */
export type TestResponse = Omit<Response, 'json'> & { json: () => Promise<any> };

/** Hono may answer synchronously or with a promise; tests only ever await. */
async function toTestResponse(res: Response | Promise<Response>): Promise<TestResponse> {
  return (await res) as unknown as TestResponse;
}

/** Thin wrapper over `app.request()` so tests read like client calls. */
export function clientFor(app: Hono<Env>) {
  return {
    get: (path: string, cookie?: string) =>
      toTestResponse(app.request(path, { headers: cookie ? { cookie } : {} })),

    post: (path: string, body?: unknown, cookie?: string) =>
      toTestResponse(
        app.request(path, {
          method: 'POST',
          headers: {
            ...(body === undefined ? {} : { 'content-type': 'application/json' }),
            ...(cookie ? { cookie } : {}),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
      ),

    delete: (path: string, cookie?: string) =>
      toTestResponse(app.request(path, { method: 'DELETE', headers: cookie ? { cookie } : {} })),
  };
}

/** The `session=...` pair from a Set-Cookie header, ready to send back as a Cookie. */
export function sessionCookie(res: Response): string {
  const header = res.headers.get('set-cookie');
  if (!header) throw new Error('response did not set a cookie');
  return header.split(';')[0];
}

/**
 * Mints the session cookie for a seeded account rather than POSTing to
 * `/api/auth/login`: the payload and secret are the ones the route signs with, so
 * `readSession` cannot tell the difference — but going through the route made
 * every fixture login pay a full argon2id verify (~44 ms, ~120 logins a run).
 * The login route itself is covered in `auth.test.ts`, including the tampered
 * and expired cookie cases.
 */
export async function loginAs(db: Db, email: string) {
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  const token = await sign(
    { sub: user.id, role: user.role, exp: Math.floor(Date.now() / 1000) + 60 * 60 },
    sessionSecret(),
    'HS256',
  );

  return `${SESSION_COOKIE}=${token}`;
}
