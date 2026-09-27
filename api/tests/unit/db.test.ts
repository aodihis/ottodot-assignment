import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPrisma, isPrismaErrorCode } from '../../src/db';

afterEach(() => vi.unstubAllEnvs());

describe('createPrisma', () => {
  it('refuses to build a client without a database url', () => {
    vi.stubEnv('DATABASE_URL', '');
    expect(() => createPrisma()).toThrow(/DATABASE_URL/);
  });

  it('builds a client for a url', async () => {
    const prisma = createPrisma('file::memory:');
    expect(typeof prisma.booking.findMany).toBe('function');
    await prisma.$disconnect();
  });
});

describe('isPrismaErrorCode', () => {
  it('matches on the error code', () => {
    expect(isPrismaErrorCode({ code: 'P2002' }, 'P2002')).toBe(true);
    expect(isPrismaErrorCode({ code: 'P2003' }, 'P2002')).toBe(false);
  });

  it('is safe on values that are not objects', () => {
    expect(isPrismaErrorCode(null, 'P2002')).toBe(false);
    expect(isPrismaErrorCode(undefined, 'P2002')).toBe(false);
    expect(isPrismaErrorCode('P2002', 'P2002')).toBe(false);
    expect(isPrismaErrorCode(new Error('P2002'), 'P2002')).toBe(false);
  });
});
