import type { Db } from '../db';

/**
 * Clears every table, in an order that respects foreign keys. Shared by the seed
 * and the test fixtures: the ordering is load-bearing, and having it in two
 * places meant a table added later could be forgotten in one of them.
 */
export async function wipeAll(db: Db) {
  await db.payment.deleteMany();
  await db.enrollment.deleteMany();
  await db.bookingItem.deleteMany();
  await db.booking.deleteMany();
  await db.student.deleteMany();
  await db.parent.deleteMany();
  await db.user.deleteMany();
  await db.trialClass.deleteMany();
}
