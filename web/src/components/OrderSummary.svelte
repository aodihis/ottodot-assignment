<script lang="ts">
  import { formatMoney } from '../lib/money';
  import { formatWhen } from '../lib/time';
  import type { Booking } from '../lib/types';

  /** What was bought and what has been charged — the same block on both the
   *  payment screen and a booking's own page, so the order never changes underfoot. */
  let { booking }: { booking: Booking } = $props();
</script>

<ul class="order">
  {#each booking.items as item (item.id)}
    <li data-student-id={item.studentId} data-refunded={item.refundedAt !== null}>
      <span class="booking-item__name">{item.name}</span>
      <span class="booking-item__class">{item.class.title}</span>
      <span class="booking-item__when">{formatWhen(item.class.startsAt)}</span>
      <span class="booking-item__price">{formatMoney(item.price, booking.currency)}</span>
      {#if item.refundAmount !== null}
        <span class="booking-item__refund">
          refunded {formatMoney(item.refundAmount, booking.currency)}
        </span>
      {/if}
    </li>
  {/each}
</ul>

{#if booking.payments.length > 0}
  <ul class="booking-payments">
    {#each booking.payments as payment (payment.id)}
      <li data-type={payment.type} data-status={payment.status}>
        {payment.type} {payment.status} — {formatMoney(payment.amount, payment.currency)}
        {#if payment.card}
          <span class="payment-card">{payment.card.brand} ···· {payment.card.last4}</span>
        {/if}
        {#if payment.failureReason}
          <span class="payment-reason">{payment.failureReason.replace('_', ' ')}</span>
        {/if}
      </li>
    {/each}
  </ul>
{/if}
