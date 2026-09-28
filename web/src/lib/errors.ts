/**
 * What a failed request should say to a parent, and what they can do about it.
 *
 * A plain table rather than anything clever. Two entries are functions because
 * their copy needs the numbers the server sent alongside the error; every other
 * code gets a fixed answer.
 *
 * The wording of "you were not charged" is not a guess. The mock gateway decides
 * the charge *before* it tries to claim the seat, so losing the last seat never
 * charges the card, and a declined card writes only a failed payment row.
 */

export type FailureAction =
  | 'pay-again'
  | 'book-again'
  | 'pick-another-class'
  | 'refresh'
  | 'sign-in'
  | 'none';

export type Failure = {
  title: string;
  detail?: string;
  actions: FailureAction[];
};

type Details = Record<string, any>;
type Entry = Failure | ((details: Details) => Failure);

const FAILURES: Record<string, Entry> = {
  CLASS_FULL: (d) => ({
    title: 'Not enough seats for that many children',
    detail: `You asked for ${d.requested}; ${d.seatsAvailable} left.`,
    actions: ['pick-another-class'],
  }),
  DUPLICATE_ACTIVE_BOOKING: {
    title: 'Already booked or held',
    detail: 'Those children already have a seat, or a selection waiting, in this class.',
    actions: ['pick-another-class'],
  },
  CLASS_ALREADY_STARTED: { title: 'That class has already started', actions: ['pick-another-class'] },
  NOT_YOUR_STUDENT: { title: 'That child is not on your account', actions: ['refresh'] },
  STUDENT_HAS_ACTIVE_BOOKING: {
    title: "Cancel this child's bookings first",
    detail: 'They still have a seat or a live selection in an upcoming class.',
    actions: ['none'],
  },

  // 402. The order is already retired, so retrying means choosing again.
  CARD_DECLINED: (d) => ({
    title: 'Your card was declined',
    detail: `${d.reason === 'insufficient_funds' ? 'Insufficient funds' : 'Card declined'}. You were not charged.`,
    actions: ['book-again'],
  }),
  // 422, and thrown before the transaction — so the hold survives and the same
  // booking is still payable with a good card.
  INVALID_CARD: {
    title: 'That card number is not valid',
    detail: 'Check the number and try again — your hold is still live.',
    actions: ['pay-again'],
  },
  SEAT_TAKEN: (d) => ({
    title: 'Someone took those seats while you were paying',
    detail: `You were not charged. ${d.seatsAvailable} seat(s) left.`,
    actions: ['pick-another-class'],
  }),
  DUPLICATE_BOOKING: {
    title: 'That child is already registered in this class',
    detail: 'You were not charged.',
    actions: ['pick-another-class'],
  },
  BOOKING_EXPIRED: {
    title: 'Your hold ran out',
    detail: 'Nothing was charged. Pick the class again.',
    actions: ['pick-another-class'],
  },
  BOOKING_NOT_PAYABLE: { title: 'This booking can no longer be paid', actions: ['pick-another-class'] },
  CANCELLATION_WINDOW_CLOSED: {
    title: 'The cancellation window has closed',
    detail: 'This class starts too soon to cancel.',
    actions: ['none'],
  },
  BOOKING_NOT_CANCELLABLE: { title: 'This booking cannot be cancelled', actions: ['none'] },

  INVALID_CREDENTIALS: { title: 'Email or password is incorrect', actions: ['none'] },
  EMAIL_TAKEN: { title: 'That email is already registered', actions: ['sign-in'] },
  UNAUTHENTICATED: { title: 'Your session has expired', detail: 'Sign in again.', actions: ['sign-in'] },
  FORBIDDEN: { title: 'Not allowed', actions: ['sign-in'] },
  VALIDATION_ERROR: (d) => ({
    title: 'Please check the form',
    detail: typeof d.message === 'string' ? d.message : undefined,
    actions: ['none'],
  }),
  INTERNAL_ERROR: { title: 'Something went wrong', actions: ['refresh'] },
};

export function describeFailure(error: {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}): Failure {
  const entry = FAILURES[error.code];
  if (!entry) return { title: error.message || 'Something went wrong', actions: ['refresh'] };

  return typeof entry === 'function' ? entry(error.details ?? {}) : entry;
}
