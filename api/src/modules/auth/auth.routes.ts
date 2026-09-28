import { Hono } from 'hono';
import type { Db } from '../../db';
import { z } from 'zod';
import type { Env } from '../../app';
import { ApiError, successBody } from '../../helpers/http';
import { authenticate, findSessionUser, registerParent, toPublicUser } from './auth.service';
import { clearSession, issueSession } from './session';

// Normalise before validating: SQLite's UNIQUE is case-sensitive, so without this
// `A@x.com` and `a@x.com` would become two accounts.
const email = z.string().trim().toLowerCase().pipe(z.email());

const registerSchema = z.object({
  email,
  password: z.string().min(8),
  name: z.string().trim().min(1),
});

const loginSchema = z.object({
  email,
  password: z.string().min(1),
});

/** Public: mounted before the session gate. */
export function createAuthRoutes(db: Db) {
  const app = new Hono<Env>();

  app.post('/register', async (c) => {
    const body = registerSchema.parse(await c.req.json());
    const user = await registerParent(db, body);

    await issueSession(c, user);
    return c.json(successBody('Account created', { user }), 201);
  });

  app.post('/login', async (c) => {
    const body = loginSchema.parse(await c.req.json());
    const user = await authenticate(db, body);

    await issueSession(c, user);
    return c.json(successBody('Logged in', { user }));
  });

  app.post('/logout', (c) => {
    clearSession(c);
    return c.body(null, 204);
  });

  return app;
}

/**
 * Behind the session gate: `app.ts` mounts this *after* `requireAuth`, so the
 * gate is declared rather than inherited from registration order.
 */
export function createSessionRoutes(db: Db) {
  const app = new Hono<Env>();

  app.get('/me', async (c) => {
    const user = await findSessionUser(db, c.get('userId'));
    if (!user) throw new ApiError(401, 'UNAUTHENTICATED', 'This session is no longer valid');

    return c.json(
      successBody('OK', {
        user: toPublicUser(user),
        parent: user.parent ? { id: user.parent.id } : null,
        students: user.parent?.students ?? [],
      }),
    );
  });

  return app;
}
