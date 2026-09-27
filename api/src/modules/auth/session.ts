import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { sign, verify } from 'hono/jwt';
import type { Env } from '../../app';
import { Role } from '../../generated/prisma/enums';
import { sessionSecret } from '../../helpers/config';

export const SESSION_COOKIE = 'session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export type Session = { sub: string; role: Role };

const isRole = (value: unknown): value is Role =>
  typeof value === 'string' && Object.hasOwn(Role, value);

export async function issueSession(c: Context<Env>, user: { id: string; role: Role }) {
  const token = await sign(
    {
      sub: user.id,
      role: user.role,
      exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
    },
    sessionSecret(),
    'HS256',
  );

  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

/** Returns null for a missing, tampered, expired, or unrecognised cookie — never throws. */
export async function readSession(c: Context<Env>): Promise<Session | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;

  try {
    const payload = await verify(token, sessionSecret(), 'HS256');
    if (typeof payload.sub !== 'string' || !isRole(payload.role)) return null;
    return { sub: payload.sub, role: payload.role };
  } catch {
    return null;
  }
}

export function clearSession(c: Context<Env>) {
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
}
