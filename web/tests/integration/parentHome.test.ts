import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ParentHome from '../../src/views/ParentHome.svelte';
import { href, route } from '../../src/lib/route.svelte';
import { aBooking, aClass } from '../helpers/fixtures';
import { ok, routeFetch } from '../helpers/fakeApi';
import { render } from '../helpers/render';
import { resetStores, signedInAsParent } from '../helpers/stores';

beforeEach(resetStores);
afterEach(() => vi.unstubAllGlobals());

const routes = {
  '/classes': () => ok({ classes: [aClass()] }),
  '/bookings': () => ok({ bookings: [] }),
};

describe('the parent shell', () => {
  it('shows the class list at the default screen', async () => {
    signedInAsParent();
    routeFetch(routes);

    const view = render(ParentHome, {});
    await vi.waitFor(() => expect(view.target.querySelector('.classes')).not.toBeNull());

    expect(view.text('.brand')).toBe('Trial class booking');
    expect(view.target.querySelector('.flow')).toBeNull();

    view.cleanup();
  });

  it('shows the child picker when the URL names a class', async () => {
    signedInAsParent();
    route.go(href.book('class-1'));
    routeFetch(routes);

    const view = render(ParentHome, {});
    await vi.waitFor(() => expect(view.target.querySelector('.flow')).not.toBeNull());

    expect(view.text('h1')).toBe('Book Fractions Made Easy');
    // The list is behind this screen, not under it.
    expect(view.target.querySelector('.my-bookings')).toBeNull();

    view.cleanup();
  });

  it('shows the payment step when the URL names a booking', async () => {
    signedInAsParent();
    route.go(href.pay('booking-1'));
    // The store is empty on a refresh, so this screen reads the booking from its id.
    routeFetch({ ...routes, '/bookings/booking-1': () => ok({ booking: aBooking() }) });

    const view = render(ParentHome, {});
    await vi.waitFor(() => expect(view.target.querySelector('.flow')).not.toBeNull());

    expect(view.text('h1')).toBe('Pay for your booking');
    expect(view.target.querySelector('.payment')).not.toBeNull();

    view.cleanup();
  });

  it('shows a booking’s own page when the URL names it', async () => {
    signedInAsParent();
    route.go(href.booking('booking-1'));
    routeFetch({ ...routes, '/bookings/booking-1': () => ok({ booking: aBooking({ status: 'confirmed' }) }) });

    const view = render(ParentHome, {});
    await vi.waitFor(() => expect(view.text('.flow__status')).toContain('Confirmed'));

    view.cleanup();
  });

  it('falls back to the class list for a URL it does not recognise', () => {
    signedInAsParent();
    routeFetch(routes);

    route.go('#/nonsense/thing');
    expect(route.current).toEqual({ name: 'classes' });
  });

  it('offers the way back to the list from every step', async () => {
    signedInAsParent();
    route.go(href.book('class-1'));
    routeFetch(routes);

    const view = render(ParentHome, {});
    await vi.waitFor(() => expect(view.target.querySelector('.flow')).not.toBeNull());

    expect(view.find<HTMLAnchorElement>('.back a').getAttribute('href')).toBe('#/');

    view.cleanup();
  });
});
