import type { Prisma } from '../generated/prisma/client';

/**
 * The seat counter: the one denormalised number in the schema.
 *
 * `TrialClass.confirmedCount` is a cache of `COUNT(enrollments)` — the roster is
 * the authority — and it exists so the capacity check can be a single conditional
 * UPDATE. Everything that moves it lives here, so counter and registrations
 * cannot be written apart.
 */

/** Seats left in a class. A hold never consumes one, so this is capacity minus the counter. */
export function seatsAvailable(cls: { capacity: number; confirmedCount: number }): number {
  return Math.max(0, cls.capacity - cls.confirmedCount);
}

/**
 * Takes one seat per line and writes the registration for each, together.
 *
 * The guarded form is the whole point on the payment path: the capacity test and
 * the increment are one statement, so two payments racing for the last seat
 * cannot both pass. Zero rows means the counter drifted under us — throwing rolls
 * the transaction back rather than under-counting. Callers that are *building* a
 * booked class (the seed, the test fixtures) pass the same guard, correctly, from
 * a class they know has room.
 */
export async function registerChildren(
  tx: Prisma.TransactionClient,
  input: {
    classId: string;
    capacity: number;
    now: Date;
    items: { id: string; studentId: string }[];
  },
) {
  const seats = input.items.length;

  const claimed = await tx.trialClass.updateMany({
    where: { id: input.classId, confirmedCount: { lte: input.capacity - seats } },
    data: { confirmedCount: { increment: seats } },
  });
  if (claimed.count === 0) {
    throw new Error(`seat guard failed after verification for class ${input.classId}`);
  }

  await tx.enrollment.createMany({
    data: input.items.map((item) => ({
      studentId: item.studentId,
      classId: input.classId,
      bookingItemId: item.id,
      enrolledAt: input.now,
    })),
  });
}
