// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { missingScenarios, type ScenarioCounts } from '../../src/helpers/demoScenarios';

/** The shape the seed writes today: everything present. */
const complete: ScenarioCounts = {
  classesWithSeats: 4,
  classesAtExactlyThreeConfirmed: 1,
  enrollments: 8,
  failedPayments: 1,
};

describe('missingScenarios', () => {
  it('is empty when the data demonstrates every case', () => {
    expect(missingScenarios(complete)).toEqual([]);
  });

  it('names each missing case on its own', () => {
    expect(missingScenarios({ ...complete, classesWithSeats: 0 })).toEqual([
      'a class with seats available',
    ]);
    expect(missingScenarios({ ...complete, classesAtExactlyThreeConfirmed: 0 })).toEqual([
      'a class holding exactly 3 confirmed seats',
    ]);
    expect(missingScenarios({ ...complete, enrollments: 0 })).toEqual([
      'an enrolled child, so a repeat booking for the same class is refused',
    ]);
    expect(missingScenarios({ ...complete, failedPayments: 0 })).toEqual([
      'a booking whose payment failed',
    ]);
  });

  it('names every missing case, in the README’s order', () => {
    expect(
      missingScenarios({
        classesWithSeats: 0,
        classesAtExactlyThreeConfirmed: 0,
        enrollments: 0,
        failedPayments: 0,
      }),
    ).toEqual([
      'a class with seats available',
      'a class holding exactly 3 confirmed seats',
      'an enrolled child, so a repeat booking for the same class is refused',
      'a booking whose payment failed',
    ]);
  });

  it('treats a full house as a missing case, not a satisfied one', () => {
    // A class at 3 confirmed is only useful if it is not also full — the seeded
    // class has capacity 4 precisely so a seat is left.
    expect(missingScenarios({ ...complete, classesWithSeats: 0 })).not.toEqual([]);
  });
});
