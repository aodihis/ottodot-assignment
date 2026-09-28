<script lang="ts">
  import { onMount } from 'svelte';
  import FailureNotice from '../components/FailureNotice.svelte';
  import OrderSummary from '../components/OrderSummary.svelte';
  import { bookings } from '../lib/bookings.svelte';
  import { classes } from '../lib/classes.svelte';
  import type { FailureAction } from '../lib/errors';
  import { formatMoney } from '../lib/money';
  import { href, route } from '../lib/route.svelte';
  import { session } from '../lib/session.svelte';

  let { bookingId }: { bookingId: string } = $props();

  const booking = $derived(bookings.current?.id === bookingId ? bookings.current : null);

  // Read from the URL's id, so this page survives a refresh or a shared link.
  onMount(() => {
    void bookings.focus(bookingId);
  });

  const STATUS: Record<string, { label: string; detail: string }> = {
    pending_payment: {
      label: 'Waiting for payment',
      detail: 'The seats are held, but not taken. Pay before the hold runs out.',
    },
    confirmed: {
      label: 'Confirmed',
      detail: 'The seats are yours and the children are on the roster.',
    },
    payment_failed: {
      label: 'Payment failed',
      detail: 'Nothing was charged, and nobody was added to the roster.',
    },
    cancelled: {
      label: 'Cancelled',
      detail: 'The seats went back on the board.',
    },
  };

  const REASONS: Record<string, string> = {
    expired: 'the hold ran out',
    seat_taken: 'someone else took the seats first',
    duplicate_booking: 'that child was already registered',
    parent_cancelled: 'you cancelled it',
  };

  const described = $derived(booking ? STATUS[booking.status] : null);

  async function cancel() {
    if (!booking) return;
    await bookings.cancel(booking.id);
  }

  function onAction(action: FailureAction) {
    switch (action) {
      case 'sign-in':
        void session.signOut();
        break;
      case 'pick-another-class':
        bookings.dismissFailure();
        route.go(href.classes);
        break;
      default:
        bookings.dismissFailure();
        void Promise.all([classes.load(), bookings.load()]);
    }
  }
</script>

<p class="back"><a href={href.classes}>Back to classes</a></p>

{#if !booking}
  <p class="loading">Loading…</p>
{:else}
  <section class="flow">
    <h1>{booking.items.map((item) => item.name).join(' and ')}</h1>

    <p class="flow__status" data-status={booking.status}>
      <strong>{described?.label}</strong>
      {#if booking.status === 'cancelled' && booking.cancelledReason}
        — {REASONS[booking.cancelledReason]}
      {/if}
    </p>
    <p class="flow__note">{described?.detail}</p>

    <OrderSummary {booking} />

    {#if bookings.failure}
      <FailureNotice failure={bookings.failure} {onAction} />
    {/if}

    {#if booking.status === 'pending_payment'}
      <p class="flow__total">
        Total <strong>{formatMoney(booking.amount, booking.currency)}</strong>
      </p>
      <a class="confirm-booking" href={href.pay(booking.id)}>Continue to payment</a>
    {/if}

    <!-- The server's verdict, rendered as-is: whether cancelling is allowed is
         never recomputed here. -->
    {#if booking.canCancel}
      <button type="button" class="cancel-booking" disabled={bookings.busy} onclick={cancel}>
        Cancel and refund {formatMoney(booking.amount, booking.currency)}
      </button>
    {/if}
  </section>
{/if}
