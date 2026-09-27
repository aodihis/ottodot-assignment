import { Hono } from 'hono';
import type { Db } from '../../db';
import type { Env } from '../../app';
import { classRoster, listClasses } from './classes.service';

export function createClassRoutes(prisma: Db) {
  const app = new Hono<Env>();

  app.get('/classes', async (c) => c.json({ classes: await listClasses(prisma) }));

  return app;
}

export function createAdminClassRoutes(prisma: Db) {
  const app = new Hono<Env>();

  app.get('/classes', async (c) => c.json({ classes: await listClasses(prisma) }));

  app.get('/classes/:id/roster', async (c) =>
    c.json(await classRoster(prisma, c.req.param('id'))),
  );

  return app;
}
