import { OpenAPIHono } from '@hono/zod-openapi';
import { Scalar } from '@scalar/hono-api-reference';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';
import type { Db } from './db';
import type { Role } from './generated/prisma/enums';
import { docsEnabled } from './helpers/config';
import { ApiError, errorBody } from './helpers/http';
import { createAuthRoutes, createSessionRoutes } from './modules/auth/auth.routes';
import { requireAdmin, requireAuth } from './modules/auth/middleware';
import { SESSION_COOKIE } from './modules/auth/session';
import { createBookingRoutes } from './modules/bookings/bookings.routes';
import { createAdminClassRoutes, createClassRoutes } from './modules/classes/classes.routes';
import { createStudentRoutes } from './modules/students/students.routes';

export type Env = {
  Variables: {
    /** Set by `requireAuth`. */
    userId: string;
    role: Role;
    /** Set by `requireParent`. */
    parentId: string;
  };
};

/**
 * Builds the app around an injected Prisma client so tests can point it at a
 * temporary database without touching process-wide state.
 *
 * Routes are declared with `createRoute`, so every one of them also feeds the
 * OpenAPI document served at `/doc` — the reference is generated from the code
 * that does the validating, not written alongside it.
 */
export function createApp(db: Db) {
  const app = new OpenAPIHono<Env>({
    // The only thing this app decides is a failed *validation*: rethrowing the
    // ZodError hands it to `onError` below, so a caller sees the same envelope
    // they saw before the routes were declared this way.
    defaultHook: (result) => {
      if (!result.success) throw result.error;
    },
  });

  app.openAPIRegistry.registerComponent('securitySchemes', 'session', {
    type: 'apiKey',
    in: 'cookie',
    name: SESSION_COOKIE,
    description: 'Set by `POST /api/auth/login` and `POST /api/auth/register`. A browser sends it on its own.',
  });

  // The only routes reachable without a session.
  app.route('/api/auth', createAuthRoutes(db));

  app.use('/api/*', requireAuth);
  app.use('/api/admin/*', requireAdmin);

  // Mounted *after* the gate, so being protected is a declaration here rather
  // than a consequence of registration order somewhere else.
  app.route('/api/auth', createSessionRoutes(db));

  app.route('/api', createStudentRoutes(db));
  app.route('/api', createBookingRoutes(db));
  app.route('/api', createClassRoutes(db));
  app.route('/api/admin', createAdminClassRoutes(db));

  // Outside the `/api/*` gate — the reference is how a caller finds out what the
  // gate wants — but mounted only where `docsEnabled()` allows. In production
  // these paths are simply not routed, so they answer the same 404 as any other
  // unknown path and do not advertise that a reference exists.
  if (docsEnabled()) {
    app.doc('/doc', {
      openapi: '3.0.0',
      info: {
        title: 'Trial class booking API',
        version: '1.0.0',
        description:
          'A parent books a trial class for a child and pays (mock); the team sees the roster. Everything is JSON, every timestamp is UTC, and money is a decimal number rather than cents.',
      },
    });
    app.get('/scalar', Scalar({ url: '/doc', pageTitle: 'Trial class booking API' }));
  }

  app.onError((err, c) => {
    if (err instanceof ApiError) {
      return c.json(errorBody(err.code, err.message, err.details), err.status);
    }
    if (err instanceof ZodError) {
      const message = err.issues
        .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
        .join('; ');
      return c.json(errorBody('VALIDATION_ERROR', message, { issues: err.issues }), 422);
    }
    // The request validator parses bodies now, so a body that is not JSON arrives
    // as an HTTPException where `c.req.json()` used to throw a SyntaxError, and a
    // body sent without a JSON content type never reaches a route at all. Both are
    // the caller's mistake, and neither should be reported as a server error.
    if (err instanceof HTTPException) {
      if (err.status === 400) {
        return c.json(errorBody('MALFORMED_JSON', 'The request body is not valid JSON'), 400);
      }
      if (err.status === 415) {
        return c.json(errorBody('UNSUPPORTED_MEDIA_TYPE', 'Send the request body as application/json'), 415);
      }
      // An HTTPException carries a status Hono *intends*. Falling through to the
      // 500 below would report a server fault the caller did not cause, so the
      // branch is total: whatever the status, it is rendered rather than swallowed.
      return c.json(errorBody(`HTTP_${err.status}`, err.message), err.status);
    }
    console.error(err);
    return c.json(errorBody('INTERNAL_ERROR', 'Something went wrong'), 500);
  });

  return app;
}
