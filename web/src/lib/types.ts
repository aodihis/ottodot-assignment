/**
 * The API's payloads, as the client sees them. These mirror the response schemas
 * the routes declare in `api/src/modules/**`, which are themselves checked
 * against what the services return — so a field that changes shape server-side
 * fails the API's own typecheck before it can surprise this side.
 *
 * Two things are already settled by the time they arrive here: money is a JSON
 * `number` at 2 decimal places, and every timestamp is an ISO-8601 UTC string
 * ending in `Z`.
 */

export type Role = 'parent' | 'admin';

export type User = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

export type Child = {
  id: string;
  name: string;
};

export type ClassView = {
  id: string;
  title: string;
  description: string | null;
  subject: string;
  startsAt: string;
  durationMin: number;
  price: number;
  capacity: number;
  confirmedCount: number;
  /** Live selections that do not hold a seat. */
  pendingHolds: number;
  seatsAvailable: number;
  cancellationDeadline: string;
};

export type BookingStatus = 'pending_payment' | 'confirmed' | 'payment_failed' | 'cancelled';

export type CancelledReason = 'expired' | 'seat_taken' | 'duplicate_booking' | 'parent_cancelled';

export type MaskedCard = {
  brand: 'visa' | 'mastercard' | 'amex' | 'discover' | 'unknown';
  last4: string;
  holder?: string;
};

export type Payment = {
  id: string;
  type: 'charge' | 'refund';
  status: 'succeeded' | 'failed';
  amount: number;
  currency: string;
  method: 'card';
  card: MaskedCard | null;
  reference: string;
  failureReason: string | null;
  createdAt: string;
};

export type BookingItem = {
  id: string;
  studentId: string;
  /** The child's name, resolved server-side so the list does not need the children lookup. */
  name: string;
  classId: string;
  class: { id: string; title: string; startsAt: string };
  price: number;
  refundedAt: string | null;
  refundAmount: number | null;
};

export type Booking = {
  id: string;
  status: BookingStatus;
  parentId: string;
  amount: number;
  currency: string;
  /** `min(hold expiry, class start)` — already reduced by the server. */
  expiresAt: string;
  confirmedAt: string | null;
  cancelledAt: string | null;
  cancelledReason: CancelledReason | null;
  /** The server's verdict. The UI renders this; it never re-derives it. */
  canCancel: boolean;
  cancellationDeadline: string | null;
  items: BookingItem[];
  payments: Payment[];
};

export type RosterEntry = {
  enrollmentId: string;
  studentId: string;
  name: string;
  parentName: string;
  bookingId: string;
  enrolledAt: string;
};

export type PendingHold = {
  itemId: string;
  bookingId: string;
  studentId: string;
  name: string;
  expiresAt: string;
};

/** Only a refunded cancellation leaves these rows, which is why they are listed separately. */
export type RefundedEntry = {
  itemId: string;
  bookingId: string;
  studentId: string;
  name: string;
  refundedAt: string;
  refundAmount: number | null;
};

export type ClassRoster = {
  class: ClassView;
  roster: RosterEntry[];
  pendingHolds: PendingHold[];
  refunded: RefundedEntry[];
};
