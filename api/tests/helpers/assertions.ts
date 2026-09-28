import { expect } from 'vitest';
import type { Db } from '../../src/db';

/**
 * The invariant every mutating booking test asserts: the denormalised counter
 * and the registrations that justify it must agree. The roster is the authority
 * — `confirmedCount` is only a cache of it, kept so the capacity check can be a
 * single conditional UPDATE.
 */
export async function expectSeatCountsConsistent(db: Db, classId: string) {
  const trialClass = await db.trialClass.findUniqueOrThrow({ where: { id: classId } });
  const enrolled = await db.enrollment.count({ where: { classId } });

  expect(trialClass.confirmedCount).toBe(enrolled);
  expect(trialClass.confirmedCount).toBeGreaterThanOrEqual(0);
  expect(trialClass.confirmedCount).toBeLessThanOrEqual(trialClass.capacity);

  return { confirmedCount: trialClass.confirmedCount, enrolled };
}
