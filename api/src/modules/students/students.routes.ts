import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { Db } from '../../db';
import type { Env } from '../../app';
import { successBody } from '../../helpers/http';
import { errorResponse, IdParamSchema, jsonBody, successResponse } from '../../helpers/openapi';
import { StudentRefSchema } from '../../helpers/students';
import { ClassSummarySchema } from '../classes/classes.view';
import { requireParent } from '../auth/middleware';
import { addStudent, listEnrollments, listStudents, removeStudent } from './students.service';

const studentSchema = z.object({ name: z.string().trim().min(1) });
const enrollmentSchema = z.object({
  enrollmentId: z.string(),
  enrolledAt: z.date(),
  class: ClassSummarySchema,
});

export function createStudentRoutes(db: Db) {
  const app = new OpenAPIHono<Env>();

  // Parent-scoped. Scoped to /students explicitly: this sub-app is mounted at
  // /api, so a bare '*' would also gate /api/admin/* and /api/bookings*. One
  // registration is enough — `/students/*` also matches the bare path.
  app.use('/students/*', requireParent(db));

  app.openapi(
    createRoute({
      method: 'get',
      path: '/students',
      operationId: 'listStudents',
      tags: ['students'],
      summary: "List the parent's children",
      description: 'Removed children are excluded.',
      security: [{ session: [] }],
      responses: {
        200: successResponse({ students: z.array(StudentRefSchema) }),
        401: errorResponse('No valid session'),
        403: errorResponse('This account is not a parent'),
      },
    }),
    async (c) => {
      const students = await listStudents(db, c.get('parentId'));
      return c.json(successBody('OK', { students }), 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/students',
      operationId: 'addStudent',
      tags: ['students'],
      summary: 'Add a child',
      request: { body: jsonBody(studentSchema) },
      security: [{ session: [] }],
      responses: {
        201: successResponse({ student: StudentRefSchema }, 'Child added'),
        401: errorResponse('No valid session'),
        403: errorResponse('This account is not a parent'),
        422: errorResponse('The request body failed validation'),
      },
    }),
    async (c) => {
      const { name } = c.req.valid('json');

      const student = await addStudent(db, c.get('parentId'), name);
      return c.json(successBody('Child added', { student }), 201);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/students/{id}/enrollments',
      operationId: 'listEnrollments',
      tags: ['students'],
      summary: "The classes a child is registered in",
      request: { params: IdParamSchema },
      security: [{ session: [] }],
      responses: {
        200: successResponse({ enrollments: z.array(enrollmentSchema) }),
        401: errorResponse('No valid session'),
        403: errorResponse('That child belongs to another parent'),
        404: errorResponse('No such child'),
      },
    }),
    async (c) => {
      const enrollments = await listEnrollments(db, c.get('parentId'), c.req.param('id'));
      return c.json(successBody('OK', { enrollments }), 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'delete',
      path: '/students/{id}',
      operationId: 'removeStudent',
      tags: ['students'],
      summary: 'Remove a child',
      description:
        'Soft-deletes the child. Refused while they are registered in a class that has not happened, or are holding a seat — cancel those bookings first.',
      request: { params: IdParamSchema },
      security: [{ session: [] }],
      responses: {
        204: { description: 'The child was removed' },
        401: errorResponse('No valid session'),
        403: errorResponse('That child belongs to another parent'),
        404: errorResponse('No such child'),
        409: errorResponse('The child has an upcoming booking'),
      },
    }),
    async (c) => {
      await removeStudent(db, c.get('parentId'), c.req.param('id'));
      return c.body(null, 204);
    },
  );

  return app;
}
