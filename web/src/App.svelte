<script lang="ts">
  import { session } from './lib/session.svelte';
  import AdminHome from './views/AdminHome.svelte';
  import Login from './views/Login.svelte';
  import ParentHome from './views/ParentHome.svelte';

  // The one bootstrap call. `/auth/me` also returns the children, so nothing else
  // has to load before a view can render.
  session.load();
</script>

<!-- The whole router: a role, and two screens. Anything more would be ceremony
     for an app with exactly two views. -->
<main class="app" data-view={session.user ? session.user.role : 'guest'}>
  {#if !session.ready}
    <p class="loading">Loading…</p>
  {:else if !session.user}
    <Login />
  {:else if session.user.role === 'admin'}
    <AdminHome />
  {:else}
    <ParentHome />
  {/if}
</main>
