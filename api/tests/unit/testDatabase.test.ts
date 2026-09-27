import { describe, expect, it } from 'vitest';
import { apiRoot, resolveSqliteUrl, sqliteFilePath } from '../helpers/testDatabase';

describe('resolveSqliteUrl', () => {
  it('makes a relative sqlite path absolute, so the CLI and the client agree on one file', () => {
    const resolved = resolveSqliteUrl('file:./prisma/test.db?journal_mode=wal');
    const expected = `${apiRoot.split('\\').join('/')}/prisma/test.db`;

    expect(resolved).toBe(`file:${expected}?journal_mode=wal`);
  });

  it('preserves query parameters when it rewrites the path', () => {
    expect(resolveSqliteUrl('file:./prisma/test.db?busy_timeout=5000')).toContain(
      '?busy_timeout=5000',
    );
  });

  it('resolves a bare filename too', () => {
    expect(resolveSqliteUrl('file:test.db')).toContain(`file:${apiRoot.split('\\').join('/')}/test.db`);
  });

  it('leaves an absolute path alone', () => {
    expect(resolveSqliteUrl('file:/srv/data/test.db')).toBe('file:/srv/data/test.db');
    expect(resolveSqliteUrl('file:C:/data/test.db')).toBe('file:C:/data/test.db');
  });

  it('leaves non-file urls alone', () => {
    expect(resolveSqliteUrl('postgresql://localhost:5432/test')).toBe(
      'postgresql://localhost:5432/test',
    );
  });
});

describe('sqliteFilePath', () => {
  it('extracts the file behind a file url, ignoring query parameters', () => {
    expect(sqliteFilePath('file:/srv/data/test.db?journal_mode=wal')).toBe('/srv/data/test.db');
  });

  it('returns null for a non-file url', () => {
    expect(sqliteFilePath('postgresql://localhost:5432/test')).toBeNull();
  });
});
