import type { Db } from '../../db';
import type { TrialClassModel } from '../../generated/prisma/models';
import { ApiError } from '../../helpers/http';
import { liveHoldWhere } from '../../helpers/bookings';
import { cancellationDeadline } from '../../helpers/config';

/**
 * Holds are soft: a `pending_payment` booking never consumes a seat, so
 * availability is capacity minus confirmed. `pendingHolds` and
 * `cancellationDeadline` are served to parents and admins alike — the parent UI
 * uses them too ("n holds are competing for this seat", "cancel until ...").
 */
function classView(cls: TrialClassModel, pendingHolds: number) {
  return {
    id: cls.id,
    title: cls.title,
    subject: cls.subject,
    startsAt: cls.startsAt,
    durationMin: cls.durationMin,
    capacity: cls.capacity,
    confirmedCount: cls.confirmedCount,
    pendingHolds,
    seatsAvailable: Math.max(0, cls.capacity - cls.confirmedCount),
    priceCents: cls.priceCents,
    cancellationDeadline: cancellationDeadline(cls.startsAt),
  };
}

async function pendingHoldsByClass(db: Db, classIds: string[], now: Date) {
  if (classIds.length === 0) return new Map<string, number>();

  const rows = await db.booking.groupBy({
    by: ['classId'],
    where: { classId: { in: classIds }, ...liveHoldWhere(now) },
    _count: { _all: true },
  });

  return new Map(rows.map((row) => [row.classId, row._count._all]));
}

export async function listClasses(db: Db) {
  const now = new Date();
  const classes = await db.trialClass.findMany({ orderBy: { startsAt: 'asc' } });
  const holds = await pendingHoldsByClass(db, classes.map((cls) => cls.id), now);

  return classes.map((cls) => classView(cls, holds.get(cls.id) ?? 0));
}

export async function classRoster(db: Db, classId: string) {
  const now = new Date();

  const cls = await db.trialClass.findUnique({ where: { id: classId } });
  if (!cls) throw new ApiError(404, 'CLASS_NOT_FOUND', 'No such class');

  const withStudentAndParent = {
    student: {
      include: { parent: { include: { user: { select: { name: true } } } } },
    },
  } as const;

  const [confirmed, pending, cancelled] = await Promise.all([
    db.booking.findMany({
      where: { classId, status: 'confirmed' },
      orderBy: { confirmedAt: 'asc' },
      include: withStudentAndParent,
    }),
    db.booking.findMany({
      where: { classId, ...liveHoldWhere(now) },
      orderBy: { createdAt: 'asc' },
      include: withStudentAndParent,
    }),
    // Refunded cancellations stay visible: without them a refunded student
    // simply vanishes from the only admin view.
    db.booking.findMany({
      where: { classId, status: 'cancelled', refundedAt: { not: null } },
      orderBy: { refundedAt: 'asc' },
      include: withStudentAndParent,
    }),
  ]);

  return {
    class: classView(cls, pending.length),
    roster: confirmed.map((booking) => ({
      bookingId: booking.id,
      studentId: booking.studentId,
      name: booking.student.name,
      parentName: booking.student.parent.user.name,
      confirmedAt: booking.confirmedAt,
    })),
    pendingHolds: pending.map((booking) => ({
      bookingId: booking.id,
      studentId: booking.studentId,
      name: booking.student.name,
      expiresAt: booking.expiresAt,
    })),
    cancelled: cancelled.map((booking) => ({
      bookingId: booking.id,
      studentId: booking.studentId,
      name: booking.student.name,
      refundedAt: booking.refundedAt,
      refundCents: booking.refundCents,
    })),
  };
}
