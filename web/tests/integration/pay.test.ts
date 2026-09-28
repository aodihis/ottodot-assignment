import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PayPage from '../../src/views/PayPage.svelte';
import { bookings } from '../../src/lib/bookings.svelte';
import { href, route } from '../../src/lib/route.svelte';
import { aBooking } from '../helpers/fixtures';
import { fail, ok, routeFetch } from '../helpers/fakeApi';
import { render } from '../helpers/render';
import { resetStores, signedInAsParent } from '../helpers/stores';

const BOOKING_ID = 'booking-1';

beforeEach(() => {
  resetStores();
  signedInAsParent();
  route.go(href.pay(BOOKING_ID));
  // Held in the list, so `focus` resolves from memory and the tests are about
  // paying rather than about fetching.
  bookings.mine = [aBooking({ status: 'pending_payment' })];
});
afterEach(() => vi.unstubAllGlobals());

const routes = (extra: Record<string, () => Response> = {}) => ({
  '/classes': () => ok({ classes: [] }),
  '/bookings': () => ok({ bookings: [aBooking({ status: 'pending_payment' })] }),
  ...extra,
});

describe('paying', () => {
  it('shows the order and the countdown together', async () => {
    routeFetch(routes());

    const view = render(PayPage, { bookingId: BOOKING_ID });
    await vi.waitFor(() => expect(view.text('h1')).not.toBe(''));

    expect(view.text('h1')).toBe('Pay for your booking');
    expect(view.text('.order')).toContain('Alya');
    expect(view.text('.flow__total')).toContain('50.00');
    expect(view.find<HTMLElement>('.hold-timer').dataset.lapsed).toBe('false');
    expect(view.target.querySelector('.payment')).not.toBeNull();

    view.cleanup();
  });

  it('sends the card the parent typed, then moves to the booking page', async () => {
    const calls = routeFetch(
      routes({
        [`POST /bookings/${BOOKING_ID}/pay`]: () =>
          ok({ booking: aBooking({ status: 'confirmed' }), payment: null }, 'Payment received'),
      }),
    );

    const view = render(PayPage, { bookingId: BOOKING_ID });
    await vi.waitFor(() => expect(view.text('h1')).not.toBe(''));

    view.type('.payment input[name=card-number]', '4242 4242 4242 4242');
    view.click('button.pay');

    await vi.waitFor(() => expect(route.current.name).toBe('booking'));

    expect(route.current).toEqual({ name: 'booking', bookingId: BOOKING_ID });
    expect(calls.find((c) => c.url.endsWith('/pay'))?.body).toEqual({
      card: { number: '4242 4242 4242 4242' },
    });

    view.cleanup();
  });

  it('says why a card was refused, and that nothing was charged', async () => {
    routeFetch(
      routes({
        [`POST /bookings/${BOOKING_ID}/pay`]: () =>
          fail(402, 'CARD_DECLINED', 'The card was declined', {
            reason: 'card_declined',
            booking: aBooking({ status: 'payment_failed' }),
            payment: null,
          }),
      }),
    );

    const view = render(PayPage, { bookingId: BOOKING_ID });
    await vi.waitFor(() => expect(view.text('h1')).not.toBe(''));

    view.type('.payment input[name=card-number]', '4000 0000 0000 0002');
    view.click('button.pay');

    await vi.waitFor(() => expect(view.target.querySelector('.failure')).not.toBeNull());

    expect(view.find<HTMLElement>('.failure').dataset.code).toBe('CARD_DECLINED');
    expect(view.text('.failure-detail')).toMatch(/not charged/i);
    // The booking in `details` is adopted, so the page stops offering payment.
    expect(view.target.querySelector('.payment')).toBeNull();

    view.cleanup();
  });

  it('stops offering payment once the hold has run out', async () => {
    bookings.mine = [
      aBooking({ status: 'pending_payment', expiresAt: new Date(Date.now() - 60_000).toISOString() }),
    ];
    routeFetch(routes());

    const view = render(PayPage, { bookingId: BOOKING_ID });
    await vi.waitFor(() => expect(view.text('h1')).not.toBe(''));

    expect(view.find<HTMLElement>('.hold-timer').dataset.lapsed).toBe('true');
    expect(view.target.querySelector('.payment')).toBeNull();
    expect(view.text('.flow__note')).toMatch(/hold has run out/i);

    view.cleanup();
  });

  it('lets the parent release the seats instead of paying', async () => {
    const calls = routeFetch(
      routes({
        [`POST /bookings/${BOOKING_ID}/cancel`]: () =>
          ok({ booking: aBooking({ status: 'cancelled', canCancel: false }), refund: null }, 'Booking cancelled'),
      }),
    );

    const view = render(PayPage, { bookingId: BOOKING_ID });
    await vi.waitFor(() => expect(view.text('h1')).not.toBe(''));

    view.click('.linkish');

    await vi.waitFor(() => expect(route.current.name).toBe('classes'));

    expect(calls.some((c) => c.url.endsWith('/cancel'))).toBe(true);
    expect(bookings.current?.status).toBe('cancelled');

    view.cleanup();
  });

  it('will not offer payment for a booking that is past it', async () => {
    bookings.mine = [aBooking({ status: 'confirmed' })];
    routeFetch(routes());

    const view = render(PayPage, { bookingId: BOOKING_ID });
    await vi.waitFor(() => expect(view.text('h1')).not.toBe(''));

    expect(view.target.querySelector('.payment')).toBeNull();
    expect(view.text('.flow__note')).toMatch(/not waiting for payment/i);

    view.cleanup();
  });
});
