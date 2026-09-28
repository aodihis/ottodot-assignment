<script lang="ts">
  import { onMount } from 'svelte';
  import FailureNotice from '../components/FailureNotice.svelte';
  import HoldTimer from '../components/HoldTimer.svelte';
  import OrderSummary from '../components/OrderSummary.svelte';
  import PaymentForm from '../components/PaymentForm.svelte';
  import { bookings } from '../lib/bookings.svelte';
  import { classes } from '../lib/classes.svelte';
  import { clock } from '../lib/clock.svelte';
  import type { FailureAction } from '../lib/errors';
  import { formatMoney } from '../lib/money';
  import { href, route } from '../lib/route.svelte';
  import { session } from '../lib/session.svelte';
  import { hasLapsed } from '../lib/time';

  let { bookingId }: { bookingId: string } = $props();

  const booking = $derived(bookings.current?.id === bookingId ? bookings.current : null);

  // A refresh lands here with an empty store, so the booking is re-read from its
  // id — which is also what shows the URL is the only state this page needs.
  onMount(() => {
    void bookings.focus(bookingId);
  });

  // Whether paying is still on offer, on the same clock the countdown reads, so
  // the two cannot disagree. Withholding the form is all the client may do: the
  // server decides, and answers BOOKING_EXPIRED if this was too eager.
  const lapsed = $derived(booking ? hasLapsed(booking.expiresAt, clock.now) : false);

  async function pay(card: { number: string; holder?: string }) {
    await bookings.pay(card);
    if (bookings.current?.status === 'confirmed') {
      route.go(href.booking(bookings.current.id));
    }
  }

  async function giveUp() {
    if (!booking) return;
    await bookings.cancel(booking.id);
    route.go(href.classes);
  }

  function onAction(action: FailureAction) {
    switch (action) {
      case 'pay-again':
        // The hold survived the refusal, so the same booking is still payable.
        bookings.dismissFailure();
        break;
      case 'sign-in':
        void session.signOut();
        break;
      default:
        // The order is spent; choosing again is the way forward.
        bookings.dismissFailure();
        void classes.load();
        route.go(href.classes);
    }
  }
</script>

<p class="back"><a href={href.classes}>Back to classes</a></p>

{#if !booking}
  <p class="loading">Loading…</p>
{:else}
  <section class="flow">
    <h1>Pay for your booking</h1>

    <OrderSummary {booking} />

    {#if bookings.failure}
      <FailureNotice failure={bookings.failure} {onAction} />
    {/if}

    {#if booking.status === 'pending_payment'}
      <!-- The countdown stays on screen even after it lapses: watching it run out
           is the honest answer, and it is why the form below has gone. -->
      <HoldTimer expiresAt={booking.expiresAt} onLapse={() => bookings.focus(bookingId)} />

      <p class="flow__total">
        Total <strong>{formatMoney(booking.amount, booking.currency)}</strong>
      </p>

      {#if lapsed}
        <p class="flow__note">
          The hold has run out, so paying is no longer on offer. Nothing was charged —
          <a href={href.book(booking.items[0]?.classId ?? '')}>start again</a>.
        </p>
      {:else}
        <PaymentForm busy={bookings.busy} onPay={pay} />

        <p class="flow__note">
          Or <button type="button" class="linkish" onclick={giveUp}>release the seats</button>
          and come back later.
        </p>
      {/if}
    {:else}
      <p class="flow__note">
        This booking is not waiting for payment.
        <a href={href.booking(booking.id)}>See its status</a>.
      </p>
    {/if}
  </section>
{/if}
