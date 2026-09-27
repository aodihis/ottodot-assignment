import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from './generated/prisma/client';

/**
 * The type of a client instance. Prisma 7's `PrismaClient` is generic, so the
 * bare class name is not assignable to an instantiated client — this alias is,
 * and the rest of the app never has to know where the client is generated.
 */
export type Db = ReturnType<typeof createPrisma>;

/**
 * Prisma 7 needs a driver adapter. For SQLite that is better-sqlite3: a single
 * synchronous connection, so statements and transactions can never interleave —
 * which is exactly the property the booking guards rely on. There is no
 * `connection_limit` to forget any more; serialization is structural.
 */
export function createPrisma(url = process.env.DATABASE_URL) {
  if (!url) throw new Error('DATABASE_URL is not set');
  return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });
}

/**
 * Prisma errors carry a stable `code` (P2002 is a unique-constraint violation),
 * while the error class itself moves between Prisma modules across versions, so
 * match on the code rather than on `instanceof`.
 */
export function isPrismaErrorCode(err: unknown, code: string): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === code;
}
