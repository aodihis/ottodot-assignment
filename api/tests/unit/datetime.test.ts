import { describe, expect, it } from 'vitest';
import { utcNow } from '../../src/helpers/datetime';

describe('utcNow', () => {
  /**
   * Thin by design: the value is `new Date()`, and what is worth pinning is that
   * no one has "helpfully" shifted it — a timezone offset subtracted here would
   * store every hold that much in the past.
   */
  it('is the current instant, unshifted', () => {
    const before = Date.now();
    const now = utcNow();

    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    expect(now.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('serialises as an absolute UTC instant', () => {
    expect(utcNow().toISOString()).toMatch(/Z$/);
  });
});
