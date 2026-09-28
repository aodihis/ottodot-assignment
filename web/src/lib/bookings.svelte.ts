import * as api from './api';
import { classes } from './classes.svelte';
import { ApiError, asApiError } from './api';
import type { Booking } from './types';

/**
 * This parent's bookings, the one currently on screen, and every action that
 * changes either.
 *
 * Two habits run through all of it. A refusal is kept as an `ApiError` rather
 * than a string, because the server puts the booking it refused in
 * `error.details` — so the screen can show what actually happened without asking
 * again. And after anything that could move a seat, the class list is reloaded:
 * a released seat raises `seatsAvailable` with no purchase behind it, and a taken
 * one lowers it, so a stale list would offer something that is not there.
 */
class Bookings {
  /** Newest first, exactly as the server ordered them. */
  mine = $state<Booking[]>([]);
  /** The booking being paid for, or the one just paid. */
  current = $state<Booking | null>(null);
  failure = $state<ApiError | null>(null);
  busy = $state(false);

  async load() {
    this.mine = (await api.listMyBookings()).bookings;
  }

  /** One order covering one class for every checked child. */
  async book(classId: string, studentIds: string[]) {
    await this.run(async () => {
      this.current = (await api.createBooking(classId, studentIds)).booking;
      await this.load();
      await classes.load();
    });
  }

  async pay(card: { number: string; holder?: string }) {
    const booking = this.current;
    if (!booking) return;

    await this.run(async () => {
      const paid = await api.payBooking(booking.id, card);
      this.current = paid.booking;
      await this.load();
      await classes.load();
    });
  }

  async cancel(id: string) {
    await this.run(async () => {
      const { booking } = await api.cancelBooking(id);
      if (this.current?.id === booking.id) this.current = booking;
      await this.load();
      // The seat is back on the board: nothing was bought, but availability moved.
      await classes.load();
    });
  }

  /**
   * Re-ask the server about the booking on screen. Used when the hold countdown
   * reaches zero: the client's clock may not be the server's, and only the server
   * may change a booking's state — so the client asks rather than deciding.
   */
  async refreshCurrent() {
    const booking = this.current;
    if (!booking) return;

    try {
      this.current = (await api.getBooking(booking.id)).booking;
      await this.load();
    } catch (err) {
      this.adopt(err);
    }
  }

  /**
   * The booking a screen is about, fetched if the list does not already hold it —
   * which is the case after a refresh, or on a link somebody was sent. `current`
   * stays null while that is in flight, so a screen can tell "still loading" from
   * "no such booking".
   */
  async focus(id: string) {
    const known = this.mine.find((booking) => booking.id === id);
    if (known) {
      this.failure = null;
      this.current = known;
      return;
    }

    this.current = null;
    try {
      this.current = (await api.getBooking(id)).booking;
      this.failure = null;
    } catch (err) {
      this.adopt(err);
    }
  }

  /** Leave the booking screen: the failure has been read, and the next action replaces it. */
  clear() {
    this.current = null;
    this.failure = null;
  }

  dismissFailure() {
    this.failure = null;
  }

  private async run(work: () => Promise<void>) {
    this.busy = true;
    this.failure = null;
    try {
      await work();
    } catch (err) {
      this.adopt(err);
    } finally {
      this.busy = false;
    }
  }

  private adopt(err: unknown) {
    const failure = asApiError(err);
    this.failure = failure;

    // Most refusals carry the booking as the server now sees it. That is more
    // accurate than what we held before the request — a refused payment has
    // already moved the order to `payment_failed`, for instance.
    const booking = failure.details?.booking as Booking | undefined;
    if (booking) this.current = booking;
  }
}

export const bookings = new Bookings();
