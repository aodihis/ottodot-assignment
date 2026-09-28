<script lang="ts">
  import type { ApiError } from '../lib/api';
  import { describeFailure, type FailureAction } from '../lib/errors';

  let { failure, onAction }: { failure: ApiError; onAction: (action: FailureAction) => void } = $props();

  const described = $derived(describeFailure(failure));

  const LABELS: Record<FailureAction, string> = {
    'pay-again': 'Try paying again',
    'book-again': 'Book again',
    'pick-another-class': 'Back to the classes',
    refresh: 'Refresh',
    'sign-in': 'Sign in',
    none: '',
  };
</script>

<!-- The one place a refusal is rendered. `data-code` is the raw server code, so
     the copy for a specific failure can be styled without guessing. -->
<div class="failure" data-code={failure.code} role="alert">
  <p class="failure-message">{described.title}</p>
  {#if described.detail}
    <p class="failure-detail">{described.detail}</p>
  {/if}

  {#if described.actions.some((action) => action !== 'none')}
    <ul class="failure-actions">
      {#each described.actions.filter((action) => action !== 'none') as action (action)}
        <li>
          <button type="button" data-action={action} onclick={() => onAction(action)}>
            {LABELS[action]}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>
