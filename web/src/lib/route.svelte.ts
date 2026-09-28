/**
 * The screens the parent flow moves through, and the hash that names them.
 *
 * There is no router library — a screen is a value and the hash is the whole
 * state. Keeping it in the URL is what makes the browser's Back button work, a
 * payment page survive a refresh, and a link to one booking shareable. That is
 * the difference between a flow and one long scrolling page.
 *
 * Navigation is by real `<a href>` elements (see `href` below), so nothing here
 * has to intercept clicks for the common case.
 */

export type Screen =
  | { name: 'classes' }
  | { name: 'book'; classId: string }
  | { name: 'pay'; bookingId: string }
  | { name: 'booking'; bookingId: string };

/** Unknown or malformed hashes fall back to the class list rather than 404. */
function parse(hash: string): Screen {
  const [head, id] = hash.replace(/^#/, '').split('/').filter(Boolean);

  if (head === 'book' && id) return { name: 'book', classId: id };
  if (head === 'pay' && id) return { name: 'pay', bookingId: id };
  if (head === 'booking' && id) return { name: 'booking', bookingId: id };

  return { name: 'classes' };
}

/** Every screen's URL, so links are built in one place. */
export const href = {
  classes: '#/',
  book: (classId: string) => `#/book/${classId}`,
  pay: (bookingId: string) => `#/pay/${bookingId}`,
  booking: (bookingId: string) => `#/booking/${bookingId}`,
};

class Route {
  current = $state<Screen>(parse(globalThis.location?.hash ?? ''));

  constructor() {
    // `addEventListener` lives on the window, not on `location`, and neither
    // exists if this ever runs outside a browser — hence the guards.
    globalThis.addEventListener?.('hashchange', () => {
      this.current = parse(globalThis.location.hash);
    });
  }

  /**
   * Moves to a screen. The state is set synchronously as well as through the hash
   * so a caller — and a test — sees the move without waiting for the event;
   * assigning an identical hash fires nothing, so there is no loop.
   */
  go(path: string) {
    this.current = parse(path);
    if (globalThis.location.hash !== path) globalThis.location.hash = path;
  }

  /** Used after an action that consumed the current screen, e.g. paying. */
  goToClasses() {
    this.go(href.classes);
  }
}

export const route = new Route();
