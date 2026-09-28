<script lang="ts">
  import { route } from '../lib/route.svelte';
  import { session } from '../lib/session.svelte';
  import BookingPage from './BookingPage.svelte';
  import BookPage from './BookPage.svelte';
  import ClassesPage from './ClassesPage.svelte';
  import PayPage from './PayPage.svelte';

  // One screen at a time, named by the URL. Booking, paying and the booking's own
  // status are three separate pages rather than three sections of one, so each
  // step gets a single job — and the browser's Back button moves between them.
  const screen = $derived(route.current);
</script>

<header class="app-header">
  <a class="brand" href="#/">Trial class booking</a>
  <span class="who">{session.user?.name}</span>
  <button type="button" class="sign-out" onclick={() => session.signOut()}>Sign out</button>
</header>

{#if screen.name === 'classes'}
  <ClassesPage />
{:else if screen.name === 'book'}
  <BookPage classId={screen.classId} />
{:else if screen.name === 'pay'}
  <PayPage bookingId={screen.bookingId} />
{:else}
  <BookingPage bookingId={screen.bookingId} />
{/if}
