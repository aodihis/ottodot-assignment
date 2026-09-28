import { Hono } from 'hono';
import type { Db } from '../../db';
import { z } from 'zod';
import type { Env } from '../../app';
import { successBody } from '../../helpers/http';
import { requireParent } from '../auth/middleware';
import { addStudent, listEnrollments, listStudents, removeStudent } from './students.service';

const studentSchema = z.object({ name: z.string().trim().min(1) });

export function createStudentRoutes(db: Db) {
  const app = new Hono<Env>();

  // Parent-scoped. Scoped to /students explicitly: this sub-app is mounted at
  // /api, so a bare '*' would also gate /api/admin/* and /api/bookings*. One
  // registration is enough — `/students/*` also matches the bare path.
  app.use('/students/*', requireParent(db));

  app.get('/students', async (c) => {
    const students = await listStudents(db, c.get('parentId'));
    return c.json(successBody('OK', { students }));
  });

  app.post('/students', async (c) => {
    const { name } = studentSchema.parse(await c.req.json());

    const student = await addStudent(db, c.get('parentId'), name);
    return c.json(successBody('Child added', { student }), 201);
  });

  app.get('/students/:id/enrollments', async (c) => {
    const enrollments = await listEnrollments(db, c.get('parentId'), c.req.param('id'));
    return c.json(successBody('OK', { enrollments }));
  });

  app.delete('/students/:id', async (c) => {
    await removeStudent(db, c.get('parentId'), c.req.param('id'));
    return c.body(null, 204);
  });

  return app;
}
