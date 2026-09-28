-- The parent-scoped booking list (`GET /api/bookings`) filters on parentId and
-- orders by createdAt descending, so it gets an index of its own.
--
-- Nothing else reads those two together: the sweep's index leads with `status`,
-- and the (parentId, status) index that this replaces was dropped in
-- 20260928030000 precisely because no query used it.

-- CreateIndex
CREATE INDEX "Booking_parentId_createdAt_idx" ON "Booking"("parentId", "createdAt");
