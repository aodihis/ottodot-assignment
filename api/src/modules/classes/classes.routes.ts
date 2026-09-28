import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { Db } from '../../db';
import type { Env } from '../../app';
import { successBody } from '../../helpers/http';
import { errorResponse, IdParamSchema, successResponse } from '../../helpers/openapi';
import { classRoster, listClasses } from './classes.service';
import { ClassViewSchema } from './classes.view';

const rosterSchema = z.array(
  z.object({
    enrollmentId: z.string(),
    studentId: z.string(),
    name: z.string(),
    parentName: z.string(),
    bookingId: z.string(),
    enrolledAt: z.date(),
  }),
);

const pendingHoldSchema = z.array(
  z.object({
    itemId: z.string(),
    bookingId: z.string(),
    studentId: z.string(),
    name: z.string(),
    expiresAt: z.date(),
  }),
);

const refundedSchema = z.array(
  z.object({
    itemId: z.string(),
    bookingId: z.string(),
    studentId: z.string(),
    name: z.string(),
    refundedAt: z.date().nullable(),
    refundAmount: z.number().nullable(),
  }),
);

export function createClassRoutes(db: Db) {
  const app = new OpenAPIHono<Env>();

  app.openapi(
    createRoute({
      method: 'get',
      path: '/classes',
      operationId: 'listClasses',
      tags: ['classes'],
      summary: 'List trial classes',
      description: 'Soonest first, with seats remaining and the deadline to cancel a confirmed booking.',
      security: [{ session: [] }],
      responses: {
        200: successResponse({ classes: z.array(ClassViewSchema) }),
        401: errorResponse('No valid session'),
      },
    }),
    async (c) => c.json(successBody('OK', { classes: await listClasses(db) }), 200),
  );

  return app;
}

export function createAdminClassRoutes(db: Db) {
  const app = new OpenAPIHono<Env>();

  app.openapi(
    createRoute({
      method: 'get',
      path: '/classes',
      operationId: 'listClassesForAdmin',
      tags: ['admin'],
      summary: 'List trial classes (admin)',
      security: [{ session: [] }],
      responses: {
        200: successResponse({ classes: z.array(ClassViewSchema) }),
        401: errorResponse('No valid session'),
        403: errorResponse('Admin only'),
      },
    }),
    async (c) => c.json(successBody('OK', { classes: await listClasses(db) }), 200),
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/classes/{id}/roster',
      operationId: 'getClassRoster',
      tags: ['admin'],
      summary: "A class's roster",
      description:
        'Registrations first, then unpaid holds still competing for a seat, then refunded cancellations — which stay visible because a refund deletes the registration. The three lists add up to everything that happened to this class.',
      request: { params: IdParamSchema },
      security: [{ session: [] }],
      responses: {
        200: successResponse({
          class: ClassViewSchema,
          roster: rosterSchema,
          pendingHolds: pendingHoldSchema,
          refunded: refundedSchema,
        }),
        401: errorResponse('No valid session'),
        403: errorResponse('Admin only'),
        404: errorResponse('No such class'),
      },
    }),
    async (c) => c.json(successBody('OK', await classRoster(db, c.req.param('id'))), 200),
  );

  return app;
}
