<script lang="ts">
  import FailureNotice from '../components/FailureNotice.svelte';
  import Roster from '../components/Roster.svelte';
  import { asApiError, listAdminClasses, listRoster, type ApiError } from '../lib/api';
  import { session } from '../lib/session.svelte';
  import { formatWhen } from '../lib/time';
  import type { ClassRoster, ClassView } from '../lib/types';

  let classList = $state<ClassView[]>([]);
  let rosters = $state<ClassRoster[]>([]);
  let failure = $state<ApiError | null>(null);

  // Every roster up front. There are five classes in the seed, so loading them
  // all keeps this a single screen with no expand state to get wrong.
  async function reload() {
    try {
      failure = null;
      classList = (await listAdminClasses()).classes;
      rosters = await Promise.all(classList.map((entry) => listRoster(entry.id)));
    } catch (err) {
      failure = asApiError(err);
    }
  }

  void reload();
</script>

<header class="app-header">
  <span class="who">{session.user?.name}</span>
  <button type="button" class="sign-out" onclick={() => session.signOut()}>Sign out</button>
</header>

{#if failure}
  <FailureNotice failure={failure} onAction={() => reload()} />
{/if}

<section class="admin">
  <h2>Trial classes and rosters</h2>

  <ul class="admin-classes">
    {#each classList as trialClass (trialClass.id)}
      <li data-class-id={trialClass.id} data-seats-available={trialClass.seatsAvailable}>
        <span class="admin-class__title">{trialClass.title}</span>
        <span class="admin-class__when">{formatWhen(trialClass.startsAt)}</span>
        <span class="admin-class__seats">{trialClass.confirmedCount} of {trialClass.capacity} confirmed</span>
        {#if trialClass.pendingHolds > 0}
          <span class="admin-class__holds">{trialClass.pendingHolds} still choosing</span>
        {/if}
      </li>
    {/each}
  </ul>

  {#each rosters as roster (roster.class.id)}
    <Roster {roster} />
  {/each}
</section>
