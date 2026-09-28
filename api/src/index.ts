import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { createApp } from './app';
import { createPrisma } from './db';
import { sessionSecret } from './helpers/config';
import { serveWeb } from './web';

// Fail fast on missing configuration instead of booting in a state where session
// cookies could be forged.
sessionSecret();

const prisma = createPrisma();
const app = createApp(prisma);

// Resolved from this file, not the working directory: npm runs workspace scripts
// with the cwd set to the workspace, so a relative `./web/dist` would look for
// `api/web/dist`.
const webDist = resolve(import.meta.dirname, '../../web/dist');
if (existsSync(webDist)) {
  serveWeb(app, webDist);
  console.log(`Serving the built app from ${webDist}`);
}

const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`);
});
