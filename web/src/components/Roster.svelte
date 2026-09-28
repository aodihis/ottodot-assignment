<script lang="ts">
  import { formatMoney } from '../lib/money';
  import { formatWhen } from '../lib/time';
  import type { ClassRoster } from '../lib/types';

  let { roster }: { roster: ClassRoster } = $props();
</script>

<section class="roster" data-class-id={roster.class.id}>
  <h3 class="roster__title">{roster.class.title}</h3>
  <p class="roster__facts">
    <span class="seats">{roster.class.seatsAvailable} of {roster.class.capacity} left</span>
    · <span class="starts-at">{formatWhen(roster.class.startsAt)}</span>
  </p>

  <h4>Confirmed ({roster.roster.length})</h4>
  <table class="roster-table">
    <thead>
      <tr><th>Child</th><th>Parent</th><th>Registered</th></tr>
    </thead>
    <tbody>
      {#each roster.roster as entry (entry.enrollmentId)}
        <tr data-student-id={entry.studentId}>
          <td class="roster__name">{entry.name}</td>
          <td class="roster__parent">{entry.parentName}</td>
          <td class="roster__at">{formatWhen(entry.enrolledAt)}</td>
        </tr>
      {/each}
      {#if roster.roster.length === 0}
        <tr class="roster__empty"><td colspan="3">Nobody yet.</td></tr>
      {/if}
    </tbody>
  </table>

  <h4>Still choosing ({roster.pendingHolds.length})</h4>
  <ul class="pending-holds">
    {#each roster.pendingHolds as hold (hold.itemId)}
      <li data-student-id={hold.studentId}>
        <span class="pending-hold__name">{hold.name}</span>
        <span class="pending-hold__expires">{formatWhen(hold.expiresAt)}</span>
      </li>
    {/each}
    {#if roster.pendingHolds.length === 0}
      <li class="pending-holds__empty">No live selections.</li>
    {/if}
  </ul>

  <!-- Listed apart from the roster: a refunded child is no longer registered, and
       the row that records it would otherwise vanish from the page entirely. -->
  <h4>Refunded ({roster.refunded.length})</h4>
  <ul class="refunded">
    {#each roster.refunded as entry (entry.itemId)}
      <li data-student-id={entry.studentId}>
        <span class="refunded__name">{entry.name}</span>
        {#if entry.refundAmount !== null}
          <span class="refunded__amount">{formatMoney(entry.refundAmount)}</span>
        {/if}
        <span class="refunded__at">{formatWhen(entry.refundedAt)}</span>
      </li>
    {/each}
    {#if roster.refunded.length === 0}
      <li class="refunded__empty">No refunds.</li>
    {/if}
  </ul>
</section>
