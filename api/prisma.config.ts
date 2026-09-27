import { defineConfig } from 'prisma/config';

// Prisma 7 no longer loads .env for you, and the connection url no longer lives
// in schema.prisma — both moved here.
try {
  process.loadEnvFile();
} catch {
  // No .env file; the default below applies.
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // --env-file so the seed has DATABASE_URL whichever way it is launched.
    seed: 'tsx --env-file=.env prisma/seed.ts',
  },
  datasource: {
    // Relative to this directory (api/), which is the working directory for
    // every script that runs Prisma here.
    url: process.env.DATABASE_URL ?? 'file:./prisma/dev.db',
  },
});
