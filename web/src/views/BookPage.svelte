<script lang="ts">
  import ChildPicker from '../components/ChildPicker.svelte';
  import FailureNotice from '../components/FailureNotice.svelte';
  import { bookings } from '../lib/bookings.svelte';
  import { classes } from '../lib/classes.svelte';
  import type { FailureAction } from '../lib/errors';
  import { formatMoney } from '../lib/money';
  import { href, route } from '../lib/route.svelte';
  import { session } from '../lib/session.svelte';
  import { formatWhen } from '../lib/time';

  let { classId }: { classId: string } = $props();

  let selected = $state<string[]>([]);

  const trialClass = $derived(classes.byId(classId));

  // A refresh or a shared link arrives with an empty store. Filling it is what
  // lets this page resolve its own class from the URL alone.
  if (classes.list.length === 0) void classes.load();

  async function confirm() {
    if (!trialClass || selected.length === 0) return;

    await bookings.book(trialClass.id, selected);
    // Straight on to paying. A refusal leaves us here, with the reason above the picker.
    if (bookings.current) route.go(href.pay(bookings.current.id));
  }

  function onAction(action: FailureAction) {
    switch (action) {
      case 'pick-another-class':
        bookings.dismissFailure();
        route.go(href.classes);
        break;
      case 'sign-in':
        void session.signOut();
        break;
      default:
        // The hold survived a malformed-card refusal, so the picker simply resets.
        bookings.dismissFailure();
        void classes.load();
    }
  }
</script>

<p class="back"><a href={href.classes}>Back to classes</a></p>

{#if !trialClass}
  <p class="loading">Loading…</p>
{:else}
  <section class="flow">
    <h1>Book {trialClass.title}</h1>

    <p class="flow__facts">
      <span class="starts-at">{formatWhen(trialClass.startsAt)}</span>
      · <span class="duration">{trialClass.durationMin} min</span>
      · <span class="price">{formatMoney(trialClass.price)}</span> each
      · <span class="seats">{trialClass.seatsAvailable} of {trialClass.capacity} left</span>
    </p>

    {#if trialClass.description}
      <p class="flow__description">{trialClass.description}</p>
    {/if}

    {#if bookings.failure}
      <FailureNotice failure={bookings.failure} {onAction} />
    {/if}

    <h2>Who is this for?</h2>

    {#if session.children.length === 0}
      <p class="choose-children__empty">
        Add a child first — <a href={href.classes}>back to your children</a>.
      </p>
    {:else}
      <ChildPicker children={session.children} bind:selected disabled={bookings.busy} />

      <p class="flow__total">
        {selected.length} child(ren) × {formatMoney(trialClass.price)} =
        <strong>{formatMoney(selected.length * trialClass.price)}</strong>
      </p>

      <p class="flow__note">
        Nothing is charged yet and no seat is taken. Continuing reserves the seats
        for a short while so you can pay — the countdown starts on the next screen.
      </p>

      <button
        type="button"
        class="confirm-booking"
        disabled={selected.length === 0 || bookings.busy}
        onclick={confirm}
      >
        {bookings.busy ? 'Reserving…' : 'Continue to payment'}
      </button>
    {/if}
  </section>
{/if}
