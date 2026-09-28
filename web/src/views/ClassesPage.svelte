<script lang="ts">
  import ClassCard from '../components/ClassCard.svelte';
  import FailureNotice from '../components/FailureNotice.svelte';
  import { asApiError, type ApiError } from '../lib/api';
  import { bookings } from '../lib/bookings.svelte';
  import { classes } from '../lib/classes.svelte';
  import { formatMoney } from '../lib/money';
  import { href } from '../lib/route.svelte';
  import { session } from '../lib/session.svelte';
  import { formatWhen } from '../lib/time';

  let newChildName = $state('');
  let failure = $state<ApiError | null>(null);

  async function reload() {
    try {
      failure = null;
      await Promise.all([classes.load(), bookings.load()]);
    } catch (err) {
      failure = asApiError(err);
    }
  }

  void reload();

  async function addChild(event: SubmitEvent) {
    event.preventDefault();
    failure = null;
    try {
      await session.addChild(newChildName.trim());
      newChildName = '';
    } catch (err) {
      failure = asApiError(err);
    }
  }

  async function removeChild(id: string) {
    failure = null;
    try {
      await session.removeChild(id);
    } catch (err) {
      failure = asApiError(err);
    }
  }
</script>

{#if failure}
  <FailureNotice failure={failure} onAction={() => (failure = null)} />
{/if}

<section class="children">
  <h2>Your children</h2>

  <ul class="children__list">
    {#each session.children as child (child.id)}
      <li data-student-id={child.id}>
        <span class="child__name">{child.name}</span>
        <button type="button" class="remove-child" onclick={() => removeChild(child.id)}>Remove</button>
      </li>
    {/each}
    {#if session.children.length === 0}
      <li class="children__empty">No children yet — add one below.</li>
    {/if}
  </ul>

  <form class="add-child" onsubmit={addChild}>
    <label>
      Add a child
      <input name="child-name" bind:value={newChildName} autocomplete="off" required />
    </label>
    <button type="submit">Add</button>
  </form>
</section>

<section class="classes">
  <h2>Trial classes</h2>

  {#each classes.list as trialClass (trialClass.id)}
    <ClassCard {trialClass} />
  {/each}
</section>

<section class="my-bookings">
  <h2>Your bookings</h2>

  {#if bookings.mine.length === 0}
    <p class="my-bookings__empty">Nothing booked yet. Pick a class above to start.</p>
  {:else}
    <ul class="my-bookings__list">
      {#each bookings.mine as booking (booking.id)}
        <li data-id={booking.id} data-status={booking.status}>
          <span class="my-booking__status">{booking.status.replace('_', ' ')}</span>
          <span class="my-booking__amount">{formatMoney(booking.amount, booking.currency)}</span>
          <span class="my-booking__items">
            {booking.items.map((item) => `${item.name} — ${item.class.title}`).join(', ')}
          </span>
          <span class="my-booking__when">
            {formatWhen(booking.items[0]?.class.startsAt ?? booking.expiresAt)}
          </span>
          <a class="open-booking" href={href.booking(booking.id)}>Open</a>
        </li>
      {/each}
    </ul>
  {/if}
</section>
