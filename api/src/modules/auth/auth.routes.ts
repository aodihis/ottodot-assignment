import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { Db } from '../../db';
import type { Env } from '../../app';
import { Role } from '../../generated/prisma/enums';
import { ApiError, successBody } from '../../helpers/http';
import { errorResponse, jsonBody, successResponse } from '../../helpers/openapi';
import { StudentRefSchema } from '../../helpers/students';
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

const userSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role: z.enum(Role),
});

/** Public: mounted before the session gate. */
export function createAuthRoutes(db: Db) {
  const app = new OpenAPIHono<Env>();

  app.openapi(
    createRoute({
      method: 'post',
      path: '/register',
      operationId: 'registerParent',
      tags: ['auth'],
      summary: 'Create a parent account',
      description: 'Registers a parent and starts their session. The account is signed in immediately.',
      request: { body: jsonBody(registerSchema) },
      responses: {
        201: successResponse({ user: userSchema }, 'Account created'),
        409: errorResponse('That email is already registered'),
        422: errorResponse('The request body failed validation'),
      },
    }),
    async (c) => {
      const body = c.req.valid('json');
      const user = await registerParent(db, body);

      await issueSession(c, user);
      return c.json(successBody('Account created', { user }), 201);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/login',
      operationId: 'login',
      tags: ['auth'],
      summary: 'Log in',
      description: 'Starts a session for an existing account. The email is matched case-insensitively.',
      request: { body: jsonBody(loginSchema) },
      responses: {
        200: successResponse({ user: userSchema }, 'Logged in'),
        401: errorResponse('The email or password is wrong'),
        422: errorResponse('The request body failed validation'),
      },
    }),
    async (c) => {
      const body = c.req.valid('json');
      const user = await authenticate(db, body);

      await issueSession(c, user);
      return c.json(successBody('Logged in', { user }), 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/logout',
      operationId: 'logout',
      tags: ['auth'],
      summary: 'Log out',
      description: 'Clears the session cookie. Answers 204 even when there was no session to clear.',
      responses: { 204: { description: 'The session cookie was cleared' } },
    }),
    (c) => {
      clearSession(c);
      return c.body(null, 204);
    },
  );

  return app;
}

/**
 * Behind the session gate: `app.ts` mounts this *after* `requireAuth`, so the
 * gate is declared rather than inherited from registration order.
 */
export function createSessionRoutes(db: Db) {
  const app = new OpenAPIHono<Env>();

  app.openapi(
    createRoute({
      method: 'get',
      path: '/me',
      operationId: 'getSessionUser',
      tags: ['auth'],
      summary: 'The signed-in user',
      description: "The current session's user, alongside their Parent and children — one call for everything the app needs on load.",
      security: [{ session: [] }],
      responses: {
        200: successResponse({
          user: userSchema,
          parent: z.object({ id: z.string() }).nullable(),
          students: z.array(StudentRefSchema),
        }),
        401: errorResponse('No valid session'),
      },
    }),
    async (c) => {
      const user = await findSessionUser(db, c.get('userId'));
      if (!user) throw new ApiError(401, 'UNAUTHENTICATED', 'This session is no longer valid');

      return c.json(
        successBody('OK', {
          user: toPublicUser(user),
          parent: user.parent ? { id: user.parent.id } : null,
          students: user.parent?.students ?? [],
        }),
        200,
      );
    },
  );

  return app;
}
