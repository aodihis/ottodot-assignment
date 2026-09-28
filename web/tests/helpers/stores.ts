import { bookings } from '../../src/lib/bookings.svelte';
import { classes } from '../../src/lib/classes.svelte';
import { href, route } from '../../src/lib/route.svelte';
import { session } from '../../src/lib/session.svelte';

/**
 * The stores are module singletons — that is the point of them — so a test has to
 * put them back to a known state. Done by assignment rather than by adding a
 * `reset()` to each, so no production code exists only for tests.
 */
export function resetStores() {
  session.clear();
  session.ready = false;

  classes.list = [];
  bookings.mine = [];
  bookings.current = null;
  bookings.failure = null;
  bookings.busy = false;

  // Navigate, rather than assigning `route.current`. `go` keeps the hash and the
  // screen in step, so a `hashchange` still in flight from an earlier test
  // re-parses whatever hash is current by then — the one this test just set —
  // instead of clobbering it with a stale screen. Screens are set the same way.
  route.go(href.classes);
}

export const ALYA = { id: 'student-1', name: 'Alya' };
export const BIMA = { id: 'student-2', name: 'Bima' };

export function signedInAsParent(children = [ALYA, BIMA]) {
  session.user = { id: 'u1', email: 'parent1@demo.test', name: 'Nadia', role: 'parent' };
  session.parentId = 'parent-1';
  session.children = children;
  session.ready = true;
}
