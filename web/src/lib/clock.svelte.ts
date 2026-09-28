/**
 * One interval for the whole app, and the only clock the UI has.
 *
 * It exists so the two things that depend on time cannot disagree: the countdown
 * a parent reads, and the decision to stop offering to pay. Both read this same
 * `now`, so there is no way for the timer to say "expired" while the pay button
 * still looks live.
 *
 * The interval is never cleared, deliberately — there is exactly one, and it
 * lives as long as the page does. A per-component interval would have to be
 * torn down and restarted on every navigation for no benefit.
 */
class Clock {
  now = $state(Date.now());
  #started = false;

  start() {
    if (this.#started) return;
    this.#started = true;
    setInterval(() => {
      this.now = Date.now();
    }, 1000);
  }
}

export const clock = new Clock();
