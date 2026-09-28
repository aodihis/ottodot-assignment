-- Indexes for the predicates that actually run, and one column that nothing read.
--
-- Hand-written for the DROP: Prisma's own `migrate dev` would rebuild the table,
-- which drops the hand-added CHECK on TrialClass in the process. These statements
-- are the minimum that leaves every constraint where it was.

-- `BookingItem.confirmedAt` had three writers and no reader. The instant a seat
-- was taken is `Booking.confirmedAt` (the order) and `Enrollment.enrolledAt` (the
-- registration); a third copy on the line was mirror state with no invariant to
-- keep it honest — the same class of mirror the previous migration deleted when
-- it removed `BookingItem.status`.
ALTER TABLE "BookingItem" DROP COLUMN "confirmedAt";

-- The roster, the counter invariant check and every "who is in this class" query
-- filter Enrollment by classId alone. The composite unique index leads with
-- studentId, so it cannot serve a classId-only lookup.
CREATE INDEX "Enrollment_classId_idx" ON "Enrollment"("classId");

-- What `expiredHoldWhere` filters on: run inside every booking creation and every
-- sweep. It replaces the index on (parentId, status), which no query used — when a
-- parent-scoped booking list is built, its own index should be added with it.
DROP INDEX "Booking_parentId_status_idx";
CREATE INDEX "Booking_status_expiresAt_idx" ON "Booking"("status", "expiresAt");
