import { Hono } from 'hono';
import type { Db } from '../../db';
import type { Env } from '../../app';
import { successBody } from '../../helpers/http';
import { classRoster, listClasses } from './classes.service';

export function createClassRoutes(db: Db) {
  const app = new Hono<Env>();

  app.get('/classes', async (c) => c.json(successBody('OK', { classes: await listClasses(db) })));

  return app;
}

export function createAdminClassRoutes(db: Db) {
  const app = new Hono<Env>();

  app.get('/classes', async (c) => c.json(successBody('OK', { classes: await listClasses(db) })));

  app.get('/classes/:id/roster', async (c) =>
    c.json(successBody('OK', await classRoster(db, c.req.param('id')))),
  );

  return app;
}
