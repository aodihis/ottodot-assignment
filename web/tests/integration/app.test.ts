import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App.svelte';
import { aClass } from '../helpers/fixtures';
import { fail, ok, routeFetch } from '../helpers/fakeApi';
import { render } from '../helpers/render';
import { resetStores } from '../helpers/stores';

beforeEach(resetStores);
afterEach(() => vi.unstubAllGlobals());

const view = () => render(App, {});

describe('App', () => {
  it('shows the login form when there is no session', async () => {
    routeFetch({ '/auth/me': () => fail(401, 'UNAUTHENTICATED', 'Log in to continue') });

    const app = view();
    await vi.waitFor(() => expect(app.target.querySelector('.login')).not.toBeNull());

    expect(app.find<HTMLElement>('main.app').dataset.view).toBe('guest');
    app.cleanup();
  });

  it('sends a parent to the class list', async () => {
    routeFetch({
      '/auth/me': () =>
        ok({
          user: { id: 'u1', email: 'parent1@demo.test', name: 'Nadia', role: 'parent' },
          parent: { id: 'p1' },
          students: [{ id: 's1', name: 'Alya' }],
        }),
      '/classes': () => ok({ classes: [aClass()] }),
      '/bookings': () => ok({ bookings: [] }),
    });

    const app = view();
    await vi.waitFor(() => expect(app.target.querySelector('.classes')).not.toBeNull());

    expect(app.find<HTMLElement>('main.app').dataset.view).toBe('parent');
    expect(app.text('.class-card__title')).toBe('Fractions Made Easy');
    app.cleanup();
  });

  it('sends an admin to the rosters instead', async () => {
    routeFetch({
      '/auth/me': () =>
        ok({
          user: { id: 'u2', email: 'admin@demo.test', name: 'Ms. Tan', role: 'admin' },
          parent: null,
          students: [],
        }),
      '/admin/classes': () => ok({ classes: [aClass()] }),
      '/admin/classes/class-1/roster': () =>
        ok({ class: aClass(), roster: [], pendingHolds: [], refunded: [] }),
    });

    const app = view();
    await vi.waitFor(() => expect(app.target.querySelector('.roster')).not.toBeNull());

    expect(app.find<HTMLElement>('main.app').dataset.view).toBe('admin');
    app.cleanup();
  });

  it('shows nothing but the loading line until the session call settles', () => {
    routeFetch({ '/auth/me': () => fail(401, 'UNAUTHENTICATED', 'Log in to continue') });

    const app = view();

    // The first paint must not be the login form: an admin would see it flash.
    expect(app.text('.loading')).toBe('Loading…');
    expect(app.target.querySelector('.login')).toBeNull();
    app.cleanup();
  });
});
