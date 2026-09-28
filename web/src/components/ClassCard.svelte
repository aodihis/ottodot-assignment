<script lang="ts">
  import { formatMoney } from '../lib/money';
  import { href } from '../lib/route.svelte';
  import { formatWhen } from '../lib/time';
  import type { ClassView } from '../lib/types';

  let { trialClass }: { trialClass: ClassView } = $props();

  // Both come from the server: seats left is `capacity - confirmedCount`, and a
  // live selection never holds one — so "full" is not the same as "nobody is
  // currently choosing".
  const full = $derived(trialClass.seatsAvailable === 0);
</script>

<article
  class="class-card"
  data-class-id={trialClass.id}
  data-seats-available={trialClass.seatsAvailable}
  data-full={full}
>
  <h3 class="class-card__title">
    {#if full}
      {trialClass.title}
    {:else}
      <!-- A real link: middle-click and keyboard work, and it needs no handler. -->
      <a href={href.book(trialClass.id)}>{trialClass.title}</a>
    {/if}
  </h3>
  <p class="class-card__subject">{trialClass.subject}</p>

  {#if trialClass.description}
    <p class="class-card__description">{trialClass.description}</p>
  {/if}

  <dl class="class-card__facts">
    <dt>Starts</dt>
    <dd class="starts-at">{formatWhen(trialClass.startsAt)}</dd>
    <dt>Length</dt>
    <dd class="duration">{trialClass.durationMin} min</dd>
    <dt>Price</dt>
    <dd class="price">{formatMoney(trialClass.price)}</dd>
    <dt>Seats</dt>
    <dd class="seats">{trialClass.seatsAvailable} of {trialClass.capacity} left</dd>
    {#if trialClass.pendingHolds > 0}
      <dt>In progress</dt>
      <dd class="holds">{trialClass.pendingHolds} other selection(s)</dd>
    {/if}
    <dt>Cancel by</dt>
    <dd class="cancel-by">{formatWhen(trialClass.cancellationDeadline)}</dd>
  </dl>

  {#if full}
    <button type="button" class="book" data-class-id={trialClass.id} disabled>Full</button>
  {:else}
    <a class="book" data-class-id={trialClass.id} href={href.book(trialClass.id)}>Book</a>
  {/if}
</article>
