import type { MiddlewareHandler } from 'hono';
import type { Env } from '../../app';
import type { Db } from '../../db';
import { Role } from '../../generated/prisma/enums';
import { ApiError } from '../../helpers/http';
import { readSession } from './session';

// These throw rather than render, so `app.onError` stays the single producer of
// error bodies — including for requests rejected here.

export const requireAuth: MiddlewareHandler<Env> = async (c, next) => {
  const session = await readSession(c);
  if (!session) throw new ApiError(401, 'UNAUTHENTICATED', 'Log in to continue');

  c.set('userId', session.sub);
  c.set('role', session.role);
  await next();
};

/** Runs after `requireAuth`, so the role is already on the context. */
export const requireAdmin: MiddlewareHandler<Env> = async (c, next) => {
  if (c.get('role') !== Role.admin) throw new ApiError(403, 'FORBIDDEN', 'Admin only');
  await next();
};

/**
 * Resolves the session user's Parent once and puts its id on the context, so
 * parent-scoped handlers never reach into the auth module themselves — and an
 * admin (who has no Parent) is refused in one place instead of per handler.
 */
export function requireParent(db: Db): MiddlewareHandler<Env> {
  return async (c, next) => {
    const parent = await db.parent.findUnique({ where: { userId: c.get('userId') } });
    if (!parent) throw new ApiError(403, 'FORBIDDEN', 'Only parent accounts can do this');

    c.set('parentId', parent.id);
    await next();
  };
}
