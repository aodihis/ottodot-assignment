import type { Hono } from 'hono';
import type { Env } from '../../src/app';
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

/** Goes through the real login endpoint, so the tests exercise it, not a copy of it. */
export async function loginAs(app: Hono<Env>, email: string) {
  const res = await clientFor(app).post('/api/auth/login', { email, password: TEST_PASSWORD });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status}`);
  return sessionCookie(res);
}
