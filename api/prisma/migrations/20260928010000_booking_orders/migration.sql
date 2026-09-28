-- Hand-written. Prisma refuses to generate this one: the old per-child "Booking"
-- table becomes "BookingItem" while a new "Booking" (the order) takes its name,
-- and a required `parentId` cannot be added to a table that already has rows.
--
-- Two things this migration must not get wrong:
--   1. money moves from integer cents to a 2-decimal value, so every copy divides by 100.0;
--   2. dropping/recreating "Booking" takes the hand-added partial unique index
--      "Booking_confirmed_unique" with it. It is recreated at the bottom, on
--      "BookingItem". Without it the duplicate-confirmed invariant is unguarded
--      in the database and nothing else would notice.

PRAGMA foreign_keys=OFF;

-- 1. The old bookings are line items now. Park the table so its rows survive
--    while the name is reused for the order table.
ALTER TABLE "Booking" RENAME TO "Booking_old";
DROP INDEX IF EXISTS "Booking_classId_status_idx";
DROP INDEX IF EXISTS "Booking_studentId_status_idx";
DROP INDEX IF EXISTS "Booking_confirmed_unique";

-- 2. The order table, and one single-item order per existing booking.
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "parentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_payment',
    "amount" DECIMAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SGD',
    "expiresAt" DATETIME NOT NULL,
    "cancelledReason" TEXT,
    "confirmedAt" DATETIME,
    "cancelledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Booking_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Parent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- `cancelledAt` is left NULL: the old schema never recorded when a booking was
-- cancelled, and inventing a timestamp would be worse than admitting that.
INSERT INTO "Booking" ("id", "parentId", "status", "amount", "currency", "expiresAt", "cancelledReason", "confirmedAt", "cancelledAt", "createdAt")
SELECT 'legacy_' || b."id", s."parentId", b."status", b."priceCents" / 100.0, 'SGD', b."expiresAt", b."cancelledReason", b."confirmedAt", NULL, b."createdAt"
FROM "Booking_old" b
JOIN "Student" s ON s."id" = b."studentId";

CREATE INDEX "Booking_parentId_status_idx" ON "Booking"("parentId", "status");

-- 3. Line items, from the parked rows.
CREATE TABLE "BookingItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookingId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "price" DECIMAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_payment',
    "confirmedAt" DATETIME,
    "refundedAt" DATETIME,
    "refundAmount" DECIMAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BookingItem_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BookingItem_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BookingItem_classId_fkey" FOREIGN KEY ("classId") REFERENCES "TrialClass" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "BookingItem" ("id", "bookingId", "studentId", "classId", "price", "status", "confirmedAt", "refundedAt", "refundAmount", "createdAt")
SELECT b."id", 'legacy_' || b."id", b."studentId", b."classId", b."priceCents" / 100.0, b."status", b."confirmedAt", b."refundedAt", b."refundCents" / 100.0, b."createdAt"
FROM "Booking_old" b;

CREATE INDEX "BookingItem_classId_status_idx" ON "BookingItem"("classId", "status");
CREATE INDEX "BookingItem_studentId_status_idx" ON "BookingItem"("studentId", "status");

DROP TABLE "Booking_old";

-- 4. Payments, replacing the thin attempts table.
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookingId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SGD',
    "method" TEXT NOT NULL DEFAULT 'card',
    "card" TEXT,
    "reference" TEXT NOT NULL,
    "failureReason" TEXT,
    "reversalOfId" TEXT,
    "payload" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "Payment" ("id", "bookingId", "type", "status", "amount", "currency", "method", "card", "reference", "failureReason", "reversalOfId", "payload", "createdAt")
SELECT a."id", 'legacy_' || a."bookingId", 'charge',
       CASE a."outcome" WHEN 'success' THEN 'succeeded' ELSE 'failed' END,
       a."amountCents" / 100.0, 'SGD', 'card', NULL, 'legacy_' || a."id", a."reason", NULL, NULL, a."createdAt"
FROM "PaymentAttempt" a;

CREATE INDEX "Payment_bookingId_status_idx" ON "Payment"("bookingId", "status");

DROP TABLE "PaymentAttempt";

-- 5. Class price: same retype, same /100.0.
CREATE TABLE "new_TrialClass" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "startsAt" DATETIME NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 60,
    "capacity" INTEGER NOT NULL DEFAULT 4,
    "confirmedCount" INTEGER NOT NULL DEFAULT 0,
    "price" DECIMAL NOT NULL DEFAULT 50
);

INSERT INTO "new_TrialClass" ("id", "title", "subject", "startsAt", "durationMin", "capacity", "confirmedCount", "price")
SELECT "id", "title", "subject", "startsAt", "durationMin", "capacity", "confirmedCount", "priceCents" / 100.0
FROM "TrialClass";

DROP TABLE "TrialClass";
ALTER TABLE "new_TrialClass" RENAME TO "TrialClass";

-- 6. The backstop, recreated on the table that now holds the seats. Prisma cannot
--    express a partial index, so this line is the only thing enforcing
--    "at most one confirmed seat per (student, class)" in the database.
CREATE UNIQUE INDEX "Booking_confirmed_unique" ON "BookingItem"("studentId", "classId") WHERE "status" = 'confirmed';

PRAGMA foreign_keys=ON;
