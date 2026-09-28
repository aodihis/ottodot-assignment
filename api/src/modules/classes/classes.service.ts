import type { Db } from '../../db';
import { liveHoldItemWhere } from '../../helpers/bookings';
import { utcNow } from '../../helpers/datetime';
import { ApiError } from '../../helpers/http';
import { moneyJson } from '../../helpers/money';
import { classView } from './classes.view';

/** Counts selected-but-unpaid seats per class. */
async function pendingHoldsByClass(db: Db, classIds: string[], now: Date) {
  if (classIds.length === 0) return new Map<string, number>();

  const rows = await db.bookingItem.groupBy({
    by: ['classId'],
    where: { classId: { in: classIds }, ...liveHoldItemWhere(now) },
    _count: { _all: true },
  });

  return new Map(rows.map((row) => [row.classId, row._count._all]));
}

export async function listClasses(db: Db) {
  const now = utcNow();
  const classes = await db.trialClass.findMany({ orderBy: { startsAt: 'asc' } });
  const holds = await pendingHoldsByClass(db, classes.map((cls) => cls.id), now);

  return classes.map((cls) => classView(cls, holds.get(cls.id) ?? 0));
}

/**
 * Who is in this class. The roster reads *registrations*, not orders: an
 * enrollment exists exactly while a child is booked in, so this query no longer
 * needs to know anything about booking status.
 */
export async function classRoster(db: Db, classId: string) {
  const now = utcNow();

  const cls = await db.trialClass.findUnique({ where: { id: classId } });
  if (!cls) throw new ApiError(404, 'CLASS_NOT_FOUND', 'No such class');

  const withStudentAndParent = {
    student: {
      include: { parent: { include: { user: { select: { name: true } } } } },
    },
  } as const;

  const [enrolled, pending, refunded] = await Promise.all([
    db.enrollment.findMany({
      where: { classId },
      orderBy: { enrolledAt: 'asc' },
      include: { ...withStudentAndParent, bookingItem: { select: { bookingId: true } } },
    }),
    db.bookingItem.findMany({
      where: { classId, ...liveHoldItemWhere(now) },
      orderBy: { createdAt: 'asc' },
      include: { ...withStudentAndParent, booking: { select: { expiresAt: true } } },
    }),
    // Refunded cancellations stay visible: the registration is deleted on refund,
    // so without this a refunded child simply vanishes from the admin's view.
    db.bookingItem.findMany({
      where: { classId, refundedAt: { not: null } },
      orderBy: { refundedAt: 'asc' },
      include: withStudentAndParent,
    }),
  ]);

  return {
    class: classView(cls, pending.length),
    roster: enrolled.map((enrollment) => ({
      enrollmentId: enrollment.id,
      studentId: enrollment.studentId,
      name: enrollment.student.name,
      parentName: enrollment.student.parent.user.name,
      bookingId: enrollment.bookingItem.bookingId,
      enrolledAt: enrollment.enrolledAt,
    })),
    pendingHolds: pending.map((item) => ({
      itemId: item.id,
      bookingId: item.bookingId,
      studentId: item.studentId,
      name: item.student.name,
      expiresAt: item.booking.expiresAt,
    })),
    // Named for what it holds: only a *refunded* cancellation leaves a row here.
    // A selection that lapsed or was abandoned unpaid has nothing to show.
    refunded: refunded.map((item) => ({
      itemId: item.id,
      bookingId: item.bookingId,
      studentId: item.studentId,
      name: item.student.name,
      refundedAt: item.refundedAt,
      refundAmount: item.refundAmount === null ? null : moneyJson(item.refundAmount),
    })),
  };
}
