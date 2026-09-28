import { createPrisma } from '../db';
import { expireHolds } from '../modules/bookings/bookings.service';

/**
 * Retires selections whose timer has run out (or whose class has started).
 *
 * Note what this does *not* do: release seats. A selection never consumed one —
 * seats are taken at payment and given back by a refunded cancel — so expiring a
 * selection changes no seat count. What it changes is that the selection can no
 * longer be paid for.
 *
 * It is also a demo surface, not the enforcement path: every read and guard is
 * predicate-based, so a lapsed selection is already untrustworthy whether or not
 * this has run. It makes the stored status honest, and the expiry visible.
 */
async function main() {
  const db = createPrisma();

  try {
    const { bookings } = await expireHolds(db);

    console.log(
      bookings === 0
        ? 'Nothing to retire, no lapsed selections.'
        : `Retired ${bookings} lapsed selection(s). Availability is unchanged: ` +
            'a selection never held a seat.',
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
