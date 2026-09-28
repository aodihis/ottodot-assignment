import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BookPage from '../../src/views/BookPage.svelte';
import { classes } from '../../src/lib/classes.svelte';
import { href, route } from '../../src/lib/route.svelte';
import { aBooking, aClass } from '../helpers/fixtures';
import { fail, ok, routeFetch } from '../helpers/fakeApi';
import { render } from '../helpers/render';
import { resetStores, signedInAsParent } from '../helpers/stores';

beforeEach(() => {
  resetStores();
  signedInAsParent();
  route.go(href.book('class-1'));
});
afterEach(() => vi.unstubAllGlobals());

const routes = (extra: Record<string, () => Response> = {}) => ({
  '/classes': () => ok({ classes: [aClass({ seatsAvailable: 1, capacity: 4 })] }),
  '/bookings': () => ok({ bookings: [] }),
  ...extra,
});

describe('choosing children', () => {
  it('shows the class and its seats', async () => {
    routeFetch(routes());

    const view = render(BookPage, { classId: 'class-1' });
    await vi.waitFor(() => expect(view.text('h1')).not.toBe(''));

    expect(view.text('h1')).toBe('Book Fractions Made Easy');
    expect(view.text('.seats')).toBe('1 of 4 left');

    view.cleanup();
  });

  it('sends one order for every checked child', async () => {
    const calls = routeFetch(routes({ 'POST /bookings': () => ok({ booking: aBooking() }, 'Booking created') }));

    const view = render(BookPage, { classId: 'class-1' });
    await vi.waitFor(() => expect(view.text('h1')).not.toBe(''));

    view.click('.child-picker input[value="student-1"]');
    view.click('.child-picker input[value="student-2"]');
    expect(view.text('.flow__total')).toContain('100.00');

    view.click('.confirm-booking');

    await vi.waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));

    const created = calls.find((c) => c.method === 'POST');
    expect(created?.body).toEqual({ classId: 'class-1', studentIds: ['student-1', 'student-2'] });

    view.cleanup();
  });

  it('moves on to payment once the seats are held', async () => {
    routeFetch(routes({ 'POST /bookings': () => ok({ booking: aBooking() }, 'Booking created') }));

    const view = render(BookPage, { classId: 'class-1' });
    await vi.waitFor(() => expect(view.text('h1')).not.toBe(''));

    view.click('.child-picker input[value="student-1"]');
    view.click('.confirm-booking');

    await vi.waitFor(() => expect(route.current.name).toBe('pay'));
    expect(route.current).toEqual({ name: 'pay', bookingId: 'booking-1' });

    view.cleanup();
  });

  it('explains a refusal here, where the choice was made', async () => {
    routeFetch(
      routes({
        'POST /bookings': () =>
          fail(409, 'CLASS_FULL', 'Not enough seats', { requested: 2, seatsAvailable: 1 }),
      }),
    );

    const view = render(BookPage, { classId: 'class-1' });
    await vi.waitFor(() => expect(view.text('h1')).not.toBe(''));

    view.click('.child-picker input[value="student-1"]');
    view.click('.child-picker input[value="student-2"]');
    view.click('.confirm-booking');

    await vi.waitFor(() => expect(view.target.querySelector('.failure')).not.toBeNull());

    const failure = view.find<HTMLElement>('.failure');
    expect(failure.dataset.code).toBe('CLASS_FULL');
    // The numbers come from the failure's details, not from the class card.
    expect(view.text('.failure-detail')).toContain('2');
    // And the page is unchanged: choosing differently is the next step.
    expect(route.current.name).toBe('book');
    expect(view.target.querySelector('.child-picker')).not.toBeNull();

    view.cleanup();
  });

  it('needs at least one child before it will send anything', async () => {
    routeFetch(routes());

    const view = render(BookPage, { classId: 'class-1' });
    await vi.waitFor(() => expect(view.text('h1')).not.toBe(''));

    expect(view.find<HTMLButtonElement>('.confirm-booking').disabled).toBe(true);

    view.cleanup();
  });

  it('sends the parent back to the list when they pick another class', async () => {
    routeFetch(
      routes({ 'POST /bookings': () => fail(409, 'CLASS_FULL', 'Not enough seats', { requested: 2, seatsAvailable: 1 }) }),
    );

    const view = render(BookPage, { classId: 'class-1' });
    await vi.waitFor(() => expect(view.text('h1')).not.toBe(''));

    view.click('.child-picker input[value="student-1"]');
    view.click('.confirm-booking');
    await vi.waitFor(() => expect(view.target.querySelector('.failure')).not.toBeNull());

    view.click('[data-action="pick-another-class"]');

    expect(route.current).toEqual({ name: 'classes' });
    expect(classes.list).toHaveLength(1); // reloaded, so the seats on it are current

    view.cleanup();
  });
});
