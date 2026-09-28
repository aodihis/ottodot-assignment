import type { Db } from '../../db';
import { liveHoldItemWhere } from '../../helpers/bookings';
import { utcNow } from '../../helpers/datetime';
import { ApiError } from '../../helpers/http';
import { activeStudentWhere, isActiveChild } from '../../helpers/students';
import { classSummary } from '../classes/classes.view';

export function listStudents(db: Db, parentId: string) {
  return db.student.findMany({
    where: activeStudentWhere(parentId),
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
}

export function addStudent(db: Db, parentId: string, name: string) {
  return db.student.create({
    data: { name, parentId },
    select: { id: true, name: true },
  });
}

/**
 * The child, or the error that says why this parent may not touch them. A removed
 * child answers "no such child" here while a booking answers "not yours" — the
 * same rule from `isActiveChild`, told differently because a child list is a list
 * of *your* children, whereas a booking names one the parent no longer has.
 */
async function ownedStudent(db: Db, parentId: string, studentId: string) {
  const student = await db.student.findUnique({ where: { id: studentId } });
  if (!student) throw new ApiError(404, 'STUDENT_NOT_FOUND', 'No such child');
  if (student.parentId !== parentId) {
    throw new ApiError(403, 'NOT_YOUR_STUDENT', 'That child belongs to another parent');
  }
  if (!isActiveChild(student)) throw new ApiError(404, 'STUDENT_NOT_FOUND', 'No such child');
  return student;
}

/**
 * The classes a child is registered in — the question the enrollment table
 * exists to answer, and the reason it is not derived from booking status.
 */
export async function listEnrollments(db: Db, parentId: string, studentId: string) {
  await ownedStudent(db, parentId, studentId);

  const enrollments = await db.enrollment.findMany({
    where: { studentId },
    include: { trialClass: true },
    orderBy: { trialClass: { startsAt: 'asc' } },
  });

  return enrollments.map((enrollment) => ({
    enrollmentId: enrollment.id,
    enrolledAt: enrollment.enrolledAt,
    class: classSummary(enrollment.trialClass),
  }));
}

export async function removeStudent(db: Db, parentId: string, studentId: string) {
  await ownedStudent(db, parentId, studentId);

  // Two questions, asked plainly: is the child registered in a class that has
  // not happened yet, and are they holding a selection for one?
  const now = utcNow();
  const [enrolled, held] = await Promise.all([
    db.enrollment.findFirst({
      where: { studentId, trialClass: { startsAt: { gt: now } } },
      select: { id: true },
    }),
    db.bookingItem.findFirst({
      where: { studentId, ...liveHoldItemWhere(now) },
      select: { id: true },
    }),
  ]);

  // Blocked rather than auto-cancelled: a registration is money, and cancelling
  // it here would issue a refund the parent never asked for — bypassing the
  // cancellation window on the way.
  if (enrolled || held) {
    throw new ApiError(
      409,
      'STUDENT_HAS_ACTIVE_BOOKING',
      "Cancel this child's upcoming bookings before removing them",
    );
  }

  await db.student.update({ where: { id: studentId }, data: { removedAt: now } });
}
