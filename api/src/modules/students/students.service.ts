import type { Db } from '../../db';
import { activeBookingWhere } from '../../helpers/bookings';
import { ApiError } from '../../helpers/http';
import { activeStudentWhere } from '../../helpers/students';

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

export async function removeStudent(db: Db, parentId: string, studentId: string) {
  const student = await db.student.findUnique({ where: { id: studentId } });
  if (!student) throw new ApiError(404, 'STUDENT_NOT_FOUND', 'No such child');
  if (student.parentId !== parentId) {
    throw new ApiError(403, 'NOT_YOUR_STUDENT', 'That child belongs to another parent');
  }
  if (student.removedAt) throw new ApiError(404, 'STUDENT_NOT_FOUND', 'No such child');

  // Blocked rather than auto-cancelled: a confirmed booking is money, and
  // cancelling it here would issue a refund the parent never asked for —
  // bypassing the cancellation window on the way.
  const activeBooking = await db.booking.findFirst({
    where: { studentId, ...activeBookingWhere(new Date()) },
    select: { id: true },
  });
  if (activeBooking) {
    throw new ApiError(
      409,
      'STUDENT_HAS_ACTIVE_BOOKING',
      "Cancel this child's upcoming bookings before removing them",
    );
  }

  await db.student.update({ where: { id: studentId }, data: { removedAt: new Date() } });
}
