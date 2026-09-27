import type { Db } from '../../db';
import { isPrismaErrorCode } from '../../db';
import type { Role } from '../../generated/prisma/enums';
import { Role as RoleValue } from '../../generated/prisma/enums';
import { ApiError } from '../../helpers/http';
import { hashPassword, verifyPassword } from '../../helpers/password';
import { childScope } from '../../helpers/students';

export type PublicUser = { id: string; email: string; name: string; role: Role };

const publicUserSelect = { id: true, email: true, name: true, role: true } as const;

/** The one place that decides which user fields leave the API. */
export function toPublicUser(user: PublicUser): PublicUser {
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

const emailTaken = () => new ApiError(409, 'EMAIL_TAKEN', 'That email is already registered');

export async function registerParent(
  db: Db,
  input: { email: string; password: string; name: string },
): Promise<PublicUser> {
  // Check the cheap thing first. Hashing is ~40 ms of CPU and 19 MiB, and this
  // endpoint is unauthenticated — paying that before a 409 is wasted work.
  const existing = await db.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) throw emailTaken();

  try {
    return await db.user.create({
      data: {
        email: input.email,
        passwordHash: await hashPassword(input.password),
        name: input.name,
        // Never read from the request: self-registering an admin is impossible
        // by construction, not by validation. Admins come from the seed.
        role: RoleValue.parent,
        parent: { create: {} },
      },
      select: publicUserSelect,
    });
  } catch (err) {
    // Still needed: two registrations of the same email at the same moment.
    if (isPrismaErrorCode(err, 'P2002')) throw emailTaken();
    throw err;
  }
}

export async function authenticate(
  db: Db,
  input: { email: string; password: string },
): Promise<PublicUser> {
  const user = await db.user.findUnique({ where: { email: input.email } });

  // A wrong password and an unknown email get the same answer.
  const passwordMatches = user ? await verifyPassword(user.passwordHash, input.password) : false;
  if (!user || !passwordMatches) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
  }

  return toPublicUser(user);
}

/** Everything `/api/auth/me` needs, in one query. */
export function findSessionUser(db: Db, userId: string) {
  return db.user.findUnique({
    where: { id: userId },
    select: {
      ...publicUserSelect,
      parent: {
        select: {
          id: true,
          students: {
            where: childScope,
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
          },
        },
      },
    },
  });
}
