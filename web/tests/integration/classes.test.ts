import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ClassesPage from '../../src/views/ClassesPage.svelte';
import { aBooking, aClass } from '../helpers/fixtures';
import { ok, routeFetch } from '../helpers/fakeApi';
import { render } from '../helpers/render';
import { resetStores, signedInAsParent } from '../helpers/stores';

beforeEach(resetStores);
afterEach(() => vi.unstubAllGlobals());

const routes = (classes = [aClass()], mine: unknown[] = []) => ({
  '/classes': () => ok({ classes }),
  '/bookings': () => ok({ bookings: mine }),
});

describe('the class list', () => {
  it('renders the seats, price and deadline the server computed', async () => {
    signedInAsParent();
    routeFetch(routes([aClass({ seatsAvailable: 1, capacity: 4, pendingHolds: 2 })]));

    const view = render(ClassesPage, {});
    await vi.waitFor(() => expect(view.target.querySelector('.class-card')).not.toBeNull());

    const card = view.find<HTMLElement>('.class-card');
    expect(card.dataset.seatsAvailable).toBe('1');
    expect(card.dataset.full).toBe('false');
    expect(view.text('.seats')).toBe('1 of 4 left');
    expect(view.text('.price')).toBe('50.00');
    // Live selections do not hold a seat, so they are shown separately.
    expect(view.text('.holds')).toContain('2');

    view.cleanup();
  });

  it('links a class to its own booking screen', async () => {
    signedInAsParent();
    routeFetch(routes());

    const view = render(ClassesPage, {});
    await vi.waitFor(() => expect(view.target.querySelector('.class-card')).not.toBeNull());

    // A real link, so Back and the keyboard work without a click handler.
    expect(view.find<HTMLAnchorElement>('a.book').getAttribute('href')).toBe('#/book/class-1');

    view.cleanup();
  });

  it('will not offer a full class', async () => {
    signedInAsParent();
    routeFetch(routes([aClass({ seatsAvailable: 0, confirmedCount: 4 })]));

    const view = render(ClassesPage, {});
    await vi.waitFor(() => expect(view.target.querySelector('.class-card')).not.toBeNull());

    expect(view.find<HTMLElement>('.class-card').dataset.full).toBe('true');
    expect(view.target.querySelector('a.book')).toBeNull();
    expect(view.find<HTMLButtonElement>('button.book').disabled).toBe(true);
    expect(view.text('button.book')).toBe('Full');

    view.cleanup();
  });

  it('lists the parent’s bookings, each linking to its own page', async () => {
    signedInAsParent();
    routeFetch(routes([aClass()], [aBooking({ status: 'confirmed' })]));

    const view = render(ClassesPage, {});
    await vi.waitFor(() => expect(view.target.querySelector('.my-bookings__list li')).not.toBeNull());

    const row = view.find<HTMLElement>('.my-bookings__list li');
    expect(row.dataset.status).toBe('confirmed');
    expect(view.find<HTMLAnchorElement>('.open-booking').getAttribute('href')).toBe(
      '#/booking/booking-1',
    );

    view.cleanup();
  });

  it('invites a booking when there are none', async () => {
    signedInAsParent();
    routeFetch(routes());

    const view = render(ClassesPage, {});
    await vi.waitFor(() => expect(view.text('.my-bookings__empty')).not.toBe(''));

    expect(view.text('.my-bookings__empty')).toMatch(/nothing booked yet/i);

    view.cleanup();
  });
});
