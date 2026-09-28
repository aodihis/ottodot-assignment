import type { Booking, ClassRoster, ClassView } from '../../src/lib/types';

/** Payload builders for the component tests, mirroring what the routes declare. */

export const aClass = (overrides: Partial<ClassView> = {}): ClassView => ({
  id: 'class-1',
  title: 'Fractions Made Easy',
  description: null,
  subject: 'math',
  startsAt: '2026-10-07T02:00:00.000Z',
  durationMin: 60,
  price: 50,
  capacity: 4,
  confirmedCount: 3,
  pendingHolds: 0,
  seatsAvailable: 1,
  cancellationDeadline: '2026-10-02T02:00:00.000Z',
  ...overrides,
});

export const aBooking = (overrides: Partial<Booking> = {}): Booking => ({
  id: 'booking-1',
  status: 'pending_payment',
  parentId: 'parent-1',
  amount: 50,
  currency: 'SGD',
  expiresAt: '2026-10-01T10:00:00.000Z',
  confirmedAt: null,
  cancelledAt: null,
  cancelledReason: null,
  canCancel: true,
  cancellationDeadline: '2026-10-02T02:00:00.000Z',
  items: [
    {
      id: 'item-1',
      studentId: 'student-1',
      name: 'Alya',
      classId: 'class-1',
      class: { id: 'class-1', title: 'Fractions Made Easy', startsAt: '2026-10-07T02:00:00.000Z' },
      price: 50,
      refundedAt: null,
      refundAmount: null,
    },
  ],
  payments: [],
  ...overrides,
});

export const aRoster = (overrides: Partial<ClassRoster> = {}): ClassRoster => ({
  class: aClass(),
  roster: [
    {
      enrollmentId: 'enrollment-1',
      studentId: 'student-1',
      name: 'Alya',
      parentName: 'Nadia',
      bookingId: 'booking-1',
      enrolledAt: '2026-09-28T01:00:00.000Z',
    },
  ],
  pendingHolds: [
    { itemId: 'item-2', bookingId: 'booking-2', studentId: 'student-2', name: 'Bima', expiresAt: '2026-10-01T10:00:00.000Z' },
  ],
  refunded: [
    {
      itemId: 'item-3',
      bookingId: 'booking-3',
      studentId: 'student-3',
      name: 'Eka',
      refundedAt: '2026-09-28T02:00:00.000Z',
      refundAmount: 50,
    },
  ],
  ...overrides,
});
