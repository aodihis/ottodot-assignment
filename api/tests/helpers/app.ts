import { createApp } from '../../src/app';
import { createPrisma } from '../../src/db';
import { clientFor } from './api';
import { testDatabaseUrl } from './testDatabase';

/**
 * The three things every integration file needs: a client on the shared test
 * database (files run one at a time — see vitest.config.ts), the app wired to
 * it, and an HTTP wrapper.
 */
export function createTestApp() {
  const db = createPrisma(testDatabaseUrl());
  const app = createApp(db);

  return { db, app, api: clientFor(app) };
}
