import { afterEach, describe, expect, it, vi } from 'vitest';
import { cancellability, holdExpiry } from '../../src/helpers/bookings';
import { DEFAULT_BOOKING_HOLD_MINUTES, bookingHoldMinutes } from '../../src/helpers/config';

afterEach(() => vi.unstubAllEnvs());

describe('bookingHoldMinutes', () => {
  it('defaults to the constant when unset or blank', () => {
    vi.stubEnv('BOOKING_HOLD_MINUTES', '');
    expect(bookingHoldMinutes()).toBe(DEFAULT_BOOKING_HOLD_MINUTES);
  });

  it('reads the configured value at call time, so a demo can shrink the timer', () => {
    vi.stubEnv('BOOKING_HOLD_MINUTES', '1');
    expect(bookingHoldMinutes()).toBe(1);

    vi.stubEnv('BOOKING_HOLD_MINUTES', '90');
    expect(bookingHoldMinutes()).toBe(90);
  });

  it('rejects a value that would make the timer meaningless', () => {
    vi.stubEnv('BOOKING_HOLD_MINUTES', '0');
    expect(() => bookingHoldMinutes()).toThrow();

    vi.stubEnv('BOOKING_HOLD_MINUTES', '-5');
    expect(() => bookingHoldMinutes()).toThrow();

    vi.stubEnv('BOOKING_HOLD_MINUTES', 'soon');
    expect(() => bookingHoldMinutes()).toThrow();
  });
});

describe('holdExpiry', () => {
  it('adds the configured hold to the given instant, not to "now"', () => {
    vi.stubEnv('BOOKING_HOLD_MINUTES', '10');
    const from = new Date('2026-10-06T10:00:00Z');

    expect(holdExpiry(from).toISOString()).toBe('2026-10-06T10:10:00.000Z');
  });
});

/**
 * One rule, two consumers — `bookingView` renders it as a flag and `cancelBooking`
 * branches on it, so what is pinned here is the rule itself, not either caller.
 * Default cutoff is 5 days from the class.
 */
describe('cancellability', () => {
  const now = new Date('2026-10-06T10:00:00Z');
  const outsideTheWindow = new Date('2026-10-15T10:00:00Z');
  const insideTheWindow = new Date('2026-10-08T10:00:00Z');
  const alreadyStarted = new Date('2026-10-05T10:00:00Z');

  it('lets an unpaid selection be cancelled, whatever the class date', () => {
    expect(cancellability({ status: 'pending_payment', startsAt: outsideTheWindow }, now)).toBe('cancellable');
    expect(cancellability({ status: 'pending_payment', startsAt: null }, now)).toBe('cancellable');
  });

  it('lets a confirmed booking be cancelled up to the cutoff, inclusive', () => {
    expect(cancellability({ status: 'confirmed', startsAt: outsideTheWindow }, now)).toBe('cancellable');
    // Exactly on the deadline is still inside it.
    expect(cancellability({ status: 'confirmed', startsAt: new Date('2026-10-11T10:00:00Z') }, now)).toBe(
      'cancellable',
    );
    expect(cancellability({ status: 'confirmed', startsAt: insideTheWindow }, now)).toBe('window_closed');
  });

  it('stops at the class, and reports a terminal booking as terminal', () => {
    expect(cancellability({ status: 'confirmed', startsAt: alreadyStarted }, now)).toBe('class_started');
    expect(cancellability({ status: 'pending_payment', startsAt: alreadyStarted }, now)).toBe('class_started');
    expect(cancellability({ status: 'payment_failed', startsAt: outsideTheWindow }, now)).toBe('not_cancellable');
    expect(cancellability({ status: 'cancelled', startsAt: outsideTheWindow }, now)).toBe('not_cancellable');
  });
});
