/**
 * The four cases the demo data promises to make reachable, and the check that it
 * still does.
 *
 * Kept out of `prisma/seed.ts` so it can be tested without running a seed: that
 * module writes to the database as soon as it is imported, and the check is
 * exactly the part a test wants to exercise on its own.
 */

/** What the seed counted once it had written the demo data. */
export type ScenarioCounts = {
  classesWithSeats: number;
  classesAtExactlyThreeConfirmed: number;
  enrollments: number;
  failedPayments: number;
};

/**
 * In the order the README lists them. Each is a row of data the demo needs, not a
 * count to be proud of — the seed's job is to make each state reachable, and this
 * is how it knows it did.
 */
const REQUIRED: Array<{ describe: string; present: (counts: ScenarioCounts) => boolean }> = [
  { describe: 'a class with seats available', present: (counts) => counts.classesWithSeats > 0 },
  {
    describe: 'a class holding exactly 3 confirmed seats',
    present: (counts) => counts.classesAtExactlyThreeConfirmed > 0,
  },
  {
    describe: 'an enrolled child, so a repeat booking for the same class is refused',
    present: (counts) => counts.enrollments > 0,
  },
  { describe: 'a booking whose payment failed', present: (counts) => counts.failedPayments > 0 },
];

/** Empty when the data demonstrates everything the README says it does. */
export function missingScenarios(counts: ScenarioCounts): string[] {
  return REQUIRED.filter((scenario) => !scenario.present(counts)).map(
    (scenario) => scenario.describe,
  );
}
