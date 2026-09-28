<script lang="ts">
  import { asApiError, type ApiError } from '../lib/api';
  import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../lib/demoAccounts';
  import { describeFailure, type FailureAction } from '../lib/errors';
  import { session } from '../lib/session.svelte';

  let mode = $state<'login' | 'register'>('login');
  let email = $state('');
  let password = $state('');
  let name = $state('');
  let failure = $state<ApiError | null>(null);
  let busy = $state(false);

  const described = $derived(failure ? describeFailure(failure) : null);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    failure = null;
    try {
      if (mode === 'login') await session.signIn(email, password);
      else await session.signUp(email, password, name);
    } catch (err) {
      failure = asApiError(err);
    } finally {
      busy = false;
    }
  }

  function useAccount(accountEmail: string) {
    mode = 'login';
    email = accountEmail;
    password = DEMO_PASSWORD;
    failure = null;
  }

  // Nothing to retry on this screen: a new sign-in attempt is the retry.
  function onAction(action: FailureAction) {
    if (action === 'refresh' || action === 'sign-in') failure = null;
  }
</script>

<section class="login">
  <h1>Trial class booking</h1>

  <form class="login__form" onsubmit={submit}>
    <h2>{mode === 'login' ? 'Sign in' : 'Create an account'}</h2>

    {#if mode === 'register'}
      <label>
        Your name
        <input name="name" bind:value={name} autocomplete="name" required />
      </label>
    {/if}

    <label>
      Email
      <input name="email" type="email" bind:value={email} autocomplete="email" required />
    </label>

    <label>
      Password
      <input
        name="password"
        type="password"
        bind:value={password}
        autocomplete={mode === 'login' ? 'current-password' : 'new-password'}
        required
      />
    </label>

    <button type="submit" disabled={busy}>
      {busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account'}
    </button>
  </form>

  {#if described}
    <div class="failure" data-code={failure?.code} role="alert">
      <p class="failure-message">{described.title}</p>
      {#if described.detail}<p class="failure-detail">{described.detail}</p>{/if}
      <ul class="failure-actions">
        <li>
          <button type="button" data-action="dismiss" onclick={() => onAction('refresh')}>Dismiss</button>
        </li>
      </ul>
    </div>
  {/if}

  <p class="login__switch">
    {#if mode === 'login'}
      <button type="button" class="switch-mode" onclick={() => (mode = 'register')}>
        No account? Register
      </button>
    {:else}
      <button type="button" class="switch-mode" onclick={() => (mode = 'login')}>
        Already registered? Sign in
      </button>
    {/if}
  </p>

  <!-- The accounts `npm run seed` creates. They are ordinary accounts, and they
       cannot be registered again — doing so answers EMAIL_TAKEN. -->
  <section class="accounts">
    <h2>Seeded accounts</h2>
    <p class="accounts__password">All use the password <code>{DEMO_PASSWORD}</code>.</p>
    <ul class="accounts__list">
      {#each DEMO_ACCOUNTS as account (account.email)}
        <li data-email={account.email} data-role={account.role}>
          <button type="button" class="use-account" onclick={() => useAccount(account.email)}>
            {account.name} — {account.email}
          </button>
          <span class="accounts__note">{account.role}, {account.note}</span>
        </li>
      {/each}
    </ul>
  </section>
</section>
