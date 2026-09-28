import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BookingPage from '../../src/views/BookingPage.svelte';
import { bookings } from '../../src/lib/bookings.svelte';
import { href, route } from '../../src/lib/route.svelte';
import { aBooking } from '../helpers/fixtures';
import { ok, routeFetch } from '../helpers/fakeApi';
import { render } from '../helpers/render';
import { resetStores, signedInAsParent } from '../helpers/stores';

const BOOKING_ID = 'booking-1';

beforeEach(() => {
  resetStores();
  signedInAsParent();
  route.go(href.booking(BOOKING_ID));
});
afterEach(() => vi.unstubAllGlobals());

function showing(booking = aBooking({ status: 'confirmed' })) {
  bookings.mine = [booking];
  return render(BookingPage, { bookingId: BOOKING_ID });
}

describe('a booking’s own page', () => {
  it('says what the status means, not just what it is called', async () => {
    routeFetch({ '/classes': () => ok({ classes: [] }) });

    const view = showing(aBooking({ status: 'confirmed' }));

    expect(view.text('.flow__status')).toContain('Confirmed');
    expect(view.text('.flow__note')).toMatch(/on the roster/i);
    expect(view.text('.order')).toContain('Alya');

    view.cleanup();
  });

  it('names the reason a booking was cancelled', async () => {
    routeFetch({ '/classes': () => ok({ classes: [] }) });

    const view = showing(
      aBooking({ status: 'cancelled', cancelledReason: 'seat_taken', canCancel: false }),
    );

    expect(view.text('.flow__status')).toContain('Cancelled');
    expect(view.text('.flow__status')).toMatch(/someone else took the seats first/i);

    view.cleanup();
  });

  it('offers payment while the seats are only held', async () => {
    routeFetch({ '/classes': () => ok({ classes: [] }) });

    const view = showing(aBooking({ status: 'pending_payment' }));

    expect(view.find<HTMLAnchorElement>('.confirm-booking').getAttribute('href')).toBe('#/pay/booking-1');

    view.cleanup();
  });

  it('offers a refund only when the server says it can be cancelled', async () => {
    routeFetch({ '/classes': () => ok({ classes: [] }) });

    const refused = showing(aBooking({ status: 'confirmed', canCancel: false }));
    expect(refused.target.querySelector('.cancel-booking')).toBeNull();
    refused.cleanup();

    const allowed = showing(aBooking({ status: 'confirmed', canCancel: true }));
    expect(allowed.target.querySelector('.cancel-booking')).not.toBeNull();
    // The amount is in the label, so there is nothing to work out.
    expect(allowed.text('.cancel-booking')).toContain('50.00');
    allowed.cleanup();
  });

  it('cancels and shows the refunded outcome', async () => {
    routeFetch({
      '/classes': () => ok({ classes: [] }),
      [`POST /bookings/${BOOKING_ID}/cancel`]: () =>
        ok(
          {
            booking: aBooking({ status: 'cancelled', cancelledReason: 'parent_cancelled', canCancel: false }),
            refund: null,
          },
          'Booking cancelled',
        ),
    });

    const view = showing(aBooking({ status: 'confirmed', canCancel: true }));
    view.click('.cancel-booking');

    await vi.waitFor(() => expect(view.text('.flow__status')).toContain('Cancelled'));

    expect(view.text('.flow__status')).toMatch(/you cancelled it/i);
    expect(view.target.querySelector('.cancel-booking')).toBeNull();

    view.cleanup();
  });

  it('shows what was charged and refunded', async () => {
    routeFetch({ '/classes': () => ok({ classes: [] }) });

    const view = showing(
      aBooking({
        status: 'cancelled',
        canCancel: false,
        items: [
          {
            id: 'item-1',
            studentId: 'student-1',
            name: 'Alya',
            classId: 'class-1',
            class: { id: 'class-1', title: 'Fractions Made Easy', startsAt: '2026-10-07T02:00:00.000Z' },
            price: 50,
            refundedAt: '2026-09-28T02:00:00.000Z',
            refundAmount: 50,
          },
        ],
        payments: [
          {
            id: 'pay-1',
            type: 'charge',
            status: 'succeeded',
            amount: 50,
            currency: 'SGD',
            method: 'card',
            card: { brand: 'visa', last4: '4242' },
            reference: 'mock_ch_1',
            failureReason: null,
            createdAt: '2026-09-28T01:00:00.000Z',
          },
        ],
      }),
    );

    expect(view.text('.booking-item__refund')).toContain('50.00');
    expect(view.text('.booking-payments')).toContain('charge succeeded');
    expect(view.text('.payment-card')).toContain('4242');

    view.cleanup();
  });
});
