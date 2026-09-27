import { Hono } from 'hono';
import type { Db } from '../../db';
import { z } from 'zod';
import type { Env } from '../../app';
import { requireParent } from '../auth/middleware';
import { addStudent, listStudents, removeStudent } from './students.service';

const studentSchema = z.object({ name: z.string().trim().min(1) });

export function createStudentRoutes(db: Db) {
  const app = new Hono<Env>();

  // Parent-scoped, applied once. Scoped to /students explicitly: this sub-app is
  // mounted at /api, so a bare '*' would also gate /api/admin/*.
  app.use('/students', requireParent(db));
  app.use('/students/*', requireParent(db));

  app.get('/students', async (c) => c.json({ students: await listStudents(db, c.get('parentId')) }));

  app.post('/students', async (c) => {
    const { name } = studentSchema.parse(await c.req.json());

    return c.json({ student: await addStudent(db, c.get('parentId'), name) }, 201);
  });

  app.delete('/students/:id', async (c) => {
    await removeStudent(db, c.get('parentId'), c.req.param('id'));
    return c.body(null, 204);
  });

  return app;
}
