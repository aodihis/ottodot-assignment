import type { Db } from '../../src/db';
import type { BookingStatus, CancelledReason, Role } from '../../src/generated/prisma/enums';
import { holdExpiry } from '../../src/helpers/bookings';
import { hashPassword } from '../../src/helpers/password';

export const TEST_PASSWORD = 'password123';
export const DAY = 86_400_000;

export const inDays = (days: number) => new Date(Date.now() + days * DAY);

// argon2id costs ~40 ms of CPU and 19 MiB per call, these tests reuse one
// password, and nothing here asserts that two hashes differ. Hash once per
// distinct value instead (the seed does the same).
const passwordHashes = new Map<string, Promise<string>>();

function hashOnce(password: string) {
  let hash = passwordHashes.get(password);
  if (!hash) {
    hash = hashPassword(password);
    passwordHashes.set(password, hash);
  }
  return hash;
}

export async function createUser(
  db: Db,
  input: {
    email: string;
    name: string;
    role?: Role;
    password?: string;
    students?: string[];
  },
) {
  const passwordHash = await hashOnce(input.password ?? TEST_PASSWORD);

  return db.user.create({
    data: {
      email: input.email,
      name: input.name,
      role: input.role ?? 'parent',
      passwordHash,
      ...(input.role === 'admin'
        ? {}
        : { parent: { create: { students: { create: (input.students ?? []).map((name) => ({ name })) } } } }),
    },
    include: { parent: { include: { students: true } } },
  });
}

export function createClass(
  db: Db,
  overrides: { title?: string; startsAt?: Date; capacity?: number; confirmedCount?: number; priceCents?: number } = {},
) {
  return db.trialClass.create({
    data: {
      title: overrides.title ?? 'Test Class',
      subject: 'science',
      startsAt: overrides.startsAt ?? inDays(7),
      capacity: overrides.capacity ?? 4,
      confirmedCount: overrides.confirmedCount ?? 0,
      priceCents: overrides.priceCents ?? 5000,
    },
  });
}

/** Creates a booking row directly; the API paths for these arrive in Phase 2. */
export function createBooking(
  db: Db,
  input: {
    studentId: string;
    classId: string;
    status?: BookingStatus;
    expiresAt?: Date;
    confirmedAt?: Date;
    refundedAt?: Date;
    refundCents?: number;
    cancelledReason?: CancelledReason;
    priceCents?: number;
  },
) {
  return db.booking.create({
    data: {
      studentId: input.studentId,
      classId: input.classId,
      status: input.status ?? 'pending_payment',
      // Defaults to a live hold, so a test that omits `expiresAt` means "this
      // hold counts" rather than silently creating an already-expired one.
      expiresAt: input.expiresAt ?? holdExpiry(),
      priceCents: input.priceCents ?? 5000,
      confirmedAt: input.confirmedAt,
      refundedAt: input.refundedAt,
      refundCents: input.refundCents,
      cancelledReason: input.cancelledReason,
    },
  });
}

/** The child with this name — throws on a typo instead of returning undefined. */
export function childNamed(db: Db, name: string) {
  return db.student.findFirstOrThrow({ where: { name } });
}
