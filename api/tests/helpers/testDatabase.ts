import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);

/** The `api/` directory — everything here is relative to it. */
export const apiRoot = resolve(import.meta.dirname, '../..');

/**
 * Integration tests run against a real SQLite database of their own, never the
 * development one. Point `TEST_DATABASE_URL` anywhere (see `api/.env.example`);
 * by default it is `api/prisma/test.db`.
 */
const DEFAULT_TEST_DATABASE_URL = 'file:./prisma/test.db';

/** `.env` is optional: CI can pass TEST_DATABASE_URL directly. */
function loadEnvIfMissing() {
  if (process.env.TEST_DATABASE_URL) return;
  try {
    process.loadEnvFile(resolve(apiRoot, '.env'));
  } catch {
    // No .env file — the default below applies.
  }
}

/**
 * SQLite resolves relative `file:` paths against the schema directory from the
 * CLI but against the working directory from the client. Absolute it up front so
 * both agree on one file.
 */
export function resolveSqliteUrl(url: string): string {
  const match = /^file:([^?]+)(\?.*)?$/.exec(url);
  if (!match) return url;

  const [, path, query = ''] = match;
  if (isAbsolutePath(path)) return url;

  return `file:${resolve(apiRoot, path).split('\\').join('/')}${query}`;
}

/** `/srv/data.db` (unix) or `C:/data.db` (windows). */
function isAbsolutePath(path: string): boolean {
  return path.startsWith('/') || /^[A-Za-z]:/.test(path);
}

export function testDatabaseUrl(): string {
  loadEnvIfMissing();
  return resolveSqliteUrl(process.env.TEST_DATABASE_URL || DEFAULT_TEST_DATABASE_URL);
}

/** The on-disk file behind a `file:` url, or null for anything else. */
export function sqliteFilePath(url: string): string | null {
  const match = /^file:([^?]+)/.exec(url);
  return match ? match[1] : null;
}

/**
 * Rebuilds the test database from the real migrations, once per run — so the
 * hand-added partial unique index is present in tests too.
 */
export function prepareTestDatabase(): string {
  const url = testDatabaseUrl();
  const file = sqliteFilePath(url);

  if (file) {
    for (const suffix of ['', '-journal', '-wal', '-shm']) {
      rmSync(`${file}${suffix}`, { force: true });
    }
  }

  execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });

  return url;
}
