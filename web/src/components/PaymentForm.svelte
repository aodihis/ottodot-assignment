<script lang="ts">
  import { TEST_CARDS } from '../lib/demoAccounts';

  let {
    busy = false,
    onPay,
  }: { busy?: boolean; onPay: (card: { number: string; holder?: string }) => void } = $props();

  let number = $state('');
  let holder = $state('');

  function submit(event: SubmitEvent) {
    event.preventDefault();
    onPay({ number, ...(holder.trim() ? { holder: holder.trim() } : {}) });
  }
</script>

<!-- There is no success or failure button: the outcome is the server's, decided
     from the number. These are the numbers it recognises. -->
<form class="payment" onsubmit={submit}>
  <label>
    Card number
    <input name="card-number" bind:value={number} autocomplete="off" required />
  </label>

  <label>
    Name on card
    <input name="card-holder" bind:value={holder} autocomplete="off" />
  </label>

  <button type="submit" class="pay" disabled={busy}>{busy ? 'Paying…' : 'Pay now'}</button>

  <ul class="test-cards">
    {#each TEST_CARDS as card (card.number)}
      <li>
        <button
          type="button"
          class="use-card"
          data-outcome={card.outcome}
          onclick={() => (number = card.number)}
        >
          {card.number}
        </button>
        <span class="test-card-outcome">{card.outcome}</span>
      </li>
    {/each}
  </ul>
</form>
