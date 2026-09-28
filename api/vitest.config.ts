import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/helpers/globalSetup.ts'],
    // Prisma's engine is happier on the forks pool than on worker threads (notably on Windows).
    pool: 'forks',
    // One shared test database, so files must not run over each other.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      SESSION_SECRET: 'test-secret',
      // `docsEnabled()` fails closed, so the docs tests need this to see the
      // reference at all. Stated rather than relying on vitest's default.
      NODE_ENV: 'test',
    },
  },
});
