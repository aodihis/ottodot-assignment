<script lang="ts">
  import { clock } from '../lib/clock.svelte';
  import { formatCountdown, hasLapsed, secondsLeft } from '../lib/time';

  let { expiresAt, onLapse }: { expiresAt: string; onLapse: () => void } = $props();

  clock.start();

  // Same clock the booking screen gates its pay form on, so the two cannot drift.
  const lapsed = $derived(hasLapsed(expiresAt, clock.now));
  const remaining = $derived(secondsLeft(expiresAt, clock.now));

  // Ask the server once per hold, at the moment the countdown reaches zero. The
  // client never retires the booking itself — it may only stop offering to pay,
  // and the server's answer decides everything else.
  let askedAbout = $state<string | null>(null);
  $effect(() => {
    if (lapsed && askedAbout !== expiresAt) {
      askedAbout = expiresAt;
      onLapse();
    }
  });
</script>

<p class="hold-timer" data-lapsed={lapsed}>
  {#if lapsed}
    Your hold has run out.
  {:else}
    Held for <span class="hold-remaining">{formatCountdown(remaining)}</span>
  {/if}
</p>
