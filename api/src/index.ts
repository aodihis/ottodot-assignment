import { serve } from '@hono/node-server';
import { createApp } from './app';
import { createPrisma } from './db';
import { sessionSecret } from './helpers/config';

// Fail fast on missing configuration instead of booting in a state where session
// cookies could be forged.
sessionSecret();

const prisma = createPrisma();
const app = createApp(prisma);
const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`);
});
