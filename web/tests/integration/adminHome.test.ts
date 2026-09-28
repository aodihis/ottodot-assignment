import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminHome from '../../src/views/AdminHome.svelte';
import { session } from '../../src/lib/session.svelte';
import { aClass, aRoster } from '../helpers/fixtures';
import { ok, routeFetch } from '../helpers/fakeApi';
import { render } from '../helpers/render';
import { resetStores } from '../helpers/stores';

beforeEach(() => {
  resetStores();
  session.user = { id: 'u2', email: 'admin@demo.test', name: 'Ms. Tan', role: 'admin' };
  session.ready = true;
});

afterEach(() => vi.unstubAllGlobals());

describe('AdminHome', () => {
  it('lists the classes with their confirmed counts', async () => {
    routeFetch({
      '/admin/classes': () => ok({ classes: [aClass({ confirmedCount: 3, seatsAvailable: 1 })] }),
      '/admin/classes/class-1/roster': () => ok(aRoster()),
    });

    const view = render(AdminHome, {});
    // Wait for a row, not the list: the `<ul>` exists before the classes arrive.
    await vi.waitFor(() => expect(view.target.querySelector('.admin-classes li')).not.toBeNull());

    expect(view.text('.admin-class__title')).toBe('Fractions Made Easy');
    expect(view.text('.admin-class__seats')).toBe('3 of 4 confirmed');

    view.cleanup();
  });

  it('shows the roster, the live selections, and the refunded apart from both', async () => {
    routeFetch({
      '/admin/classes': () => ok({ classes: [aClass()] }),
      '/admin/classes/class-1/roster': () => ok(aRoster()),
    });

    const view = render(AdminHome, {});
    await vi.waitFor(() => expect(view.target.querySelector('.roster')).not.toBeNull());

    expect(view.all('.roster-table tbody tr[data-student-id]')).toHaveLength(1);
    expect(view.text('.roster__name')).toBe('Alya');
    expect(view.text('.roster__parent')).toBe('Nadia');

    expect(view.all('.pending-holds li[data-student-id]')).toHaveLength(1);
    expect(view.text('.pending-hold__name')).toBe('Bima');

    // A refunded child is no longer registered, so without this section the row
    // that records the refund would vanish from the page entirely.
    expect(view.all('.refunded li[data-student-id]')).toHaveLength(1);
    expect(view.text('.refunded__name')).toBe('Eka');
    expect(view.text('.refunded__amount')).toBe('50.00');

    view.cleanup();
  });

  it('says so plainly when a class has nobody in it', async () => {
    routeFetch({
      '/admin/classes': () => ok({ classes: [aClass()] }),
      '/admin/classes/class-1/roster': () =>
        ok(aRoster({ roster: [], pendingHolds: [], refunded: [] })),
    });

    const view = render(AdminHome, {});
    await vi.waitFor(() => expect(view.target.querySelector('.roster')).not.toBeNull());

    expect(view.text('.roster__empty')).toMatch(/nobody yet/i);
    expect(view.text('.pending-holds__empty')).toMatch(/no live selections/i);
    expect(view.text('.refunded__empty')).toMatch(/no refunds/i);

    view.cleanup();
  });
});
