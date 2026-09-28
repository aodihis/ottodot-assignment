import { Hono } from 'hono';
import { ZodError } from 'zod';
import type { Db } from './db';
import type { Role } from './generated/prisma/enums';
import { ApiError, errorBody } from './helpers/http';
import { createAuthRoutes, createSessionRoutes } from './modules/auth/auth.routes';
import { requireAdmin, requireAuth } from './modules/auth/middleware';
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
 */
export function createApp(db: Db) {
  const app = new Hono<Env>();

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
    // `c.req.json()` is a bare JSON.parse, so a body that is not JSON arrives here
    // as a SyntaxError. That is a client mistake, and reporting it as a server
    // error would both lie to the caller and drown the real 500s in log noise.
    if (err instanceof SyntaxError) {
      return c.json(errorBody('MALFORMED_JSON', 'The request body is not valid JSON'), 400);
    }
    console.error(err);
    return c.json(errorBody('INTERNAL_ERROR', 'Something went wrong'), 500);
  });

  return app;
}
