import type { Db } from '../../src/db';
import type { BookingStatus, CancelledReason, Role } from '../../src/generated/prisma/enums';
import { holdExpiry } from '../../src/helpers/bookings';
import { money, sumMoney } from '../../src/helpers/money';
import { hashPassword } from '../../src/helpers/password';
import { registerChildren } from '../../src/helpers/seats';

export const TEST_PASSWORD = 'password123';
export const DAY = 86_400_000;
export const MINUTE = 60_000;

export const inDays = (days: number) => new Date(Date.now() + days * DAY);

/** Clock arithmetic for holds — negative for "already lapsed". */
export const minutesFromNow = (minutes: number) => new Date(Date.now() + minutes * MINUTE);

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

export async function createClass(
  db: Db,
  overrides: { title?: string; startsAt?: Date; capacity?: number; confirmedCount?: number; price?: number } = {},
) {
  return db.trialClass.create({
    data: {
      title: overrides.title ?? 'Test Class',
      subject: 'science',
      startsAt: overrides.startsAt ?? inDays(7),
      capacity: overrides.capacity ?? 4,
      confirmedCount: overrides.confirmedCount ?? 0,
      price: overrides.price ?? 50,
    },
  });
}

/**
 * Creates an order with one line item per child. A `confirmed` booking also
 * moves `TrialClass.confirmedCount`, because a booked seat *is* a taken seat —
 * letting the two drift silently was a trap in the earlier fixture.
 */
export async function createBooking(
  db: Db,
  input: {
    studentIds: string[];
    classId: string;
    status?: BookingStatus;
    expiresAt?: Date;
    confirmedAt?: Date;
    refundedAt?: Date;
    refundAmount?: number;
    cancelledReason?: CancelledReason;
    price?: number;
  },
) {
  const price = money(input.price ?? 50);
  const now = new Date();
  const owner = await db.student.findFirstOrThrow({ where: { id: input.studentIds[0] } });

  const booking = await db.booking.create({
    data: {
      parentId: owner.parentId,
      status: input.status ?? 'pending_payment',
      amount: sumMoney(input.studentIds.map(() => price)),
      currency: 'SGD',
      // Defaults to a live hold, so a test that omits `expiresAt` means "this
      // selection counts" rather than silently creating a lapsed one.
      expiresAt: input.expiresAt ?? holdExpiry(),
      cancelledReason: input.cancelledReason ?? null,
      confirmedAt: input.confirmedAt ?? (input.status === 'confirmed' ? now : null),
      items: {
        create: input.studentIds.map((studentId) => ({
          studentId,
          classId: input.classId,
          price,
          refundedAt: input.refundedAt ?? null,
          refundAmount: input.refundAmount === undefined ? null : money(input.refundAmount),
        })),
      },
    },
    include: { items: true },
  });

  if (input.status === 'confirmed') {
    // A confirmed booking *is* a registration plus a taken seat, written through
    // the same helper the payment path uses — letting either drift from the other
    // was a trap in the earlier fixture.
    const cls = await db.trialClass.findUniqueOrThrow({ where: { id: input.classId } });
    await registerChildren(db, {
      classId: input.classId,
      capacity: cls.capacity,
      now,
      items: booking.items,
    });
  }

  return booking;
}

/** The child with this name — throws on a typo instead of returning undefined. */
export function childNamed(db: Db, name: string) {
  return db.student.findFirstOrThrow({ where: { name } });
}
