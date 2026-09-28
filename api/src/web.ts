import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import type { Hono } from 'hono';
import type { Env } from './app';
import { errorBody } from './helpers/http';

/**
 * Serves the built SPA: the files Vite emitted, and the same HTML shell for any
 * other GET that is not under `/api` — the app owns its own state, so an unknown
 * path is a client-side one rather than a 404.
 *
 * Called only from `index.ts`, and only when the build is actually there.
 * Everything under `api/tests` builds the app through `createApp(db)`, so no test
 * ever registers this and `app.request()` keeps answering JSON exactly as before.
 */
export function serveWeb(app: Hono<Env>, distRoot: string) {
  const files = serveStatic({ root: distRoot });

  // Read once, at boot: it is a single small file, and it never changes while the
  // process is running.
  const shellPath = join(distRoot, 'index.html');
  const shell = existsSync(shellPath) ? readFileSync(shellPath, 'utf8') : null;

  app.use('*', async (c, next) => {
    // `/api` is the API's namespace: a mistyped endpoint must stay a JSON 404,
    // not turn into a 200 carrying the app's HTML.
    if (c.req.path === '/api' || c.req.path.startsWith('/api/')) return next();

    // Returned, not awaited-and-dropped: when `serveStatic` finds a file it
    // answers with a Response, and Hono only marks the context finalized if that
    // Response travels back up the chain.
    return files(c, next);
  });

  app.get('*', (c) => {
    if (c.req.path.startsWith('/api')) {
      return c.json(errorBody('NOT_FOUND', 'No such endpoint'), 404);
    }

    return shell ? c.html(shell) : c.notFound();
  });
}
