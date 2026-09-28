// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { formatCountdown, hasLapsed, secondsLeft } from '../../src/lib/time';

const at = (iso: string) => new Date(iso).getTime();

describe('hasLapsed', () => {
  it('agrees with the server: expiresAt <= now is lapsed', () => {
    const expiresAt = '2026-10-01T10:00:00.000Z';

    expect(hasLapsed(expiresAt, at('2026-10-01T09:59:59.000Z'))).toBe(false);
    // The boundary is inclusive, which is the comparison `payBooking` makes.
    expect(hasLapsed(expiresAt, at('2026-10-01T10:00:00.000Z'))).toBe(true);
    expect(hasLapsed(expiresAt, at('2026-10-01T10:00:01.000Z'))).toBe(true);
  });
});

describe('secondsLeft', () => {
  it('counts whole seconds down, and never goes negative', () => {
    const expiresAt = '2026-10-01T10:00:00.000Z';

    expect(secondsLeft(expiresAt, at('2026-10-01T09:59:30.000Z'))).toBe(30);
    expect(secondsLeft(expiresAt, at('2026-10-01T09:59:59.500Z'))).toBe(1);
    expect(secondsLeft(expiresAt, at('2026-10-01T10:00:00.000Z'))).toBe(0);
    expect(secondsLeft(expiresAt, at('2026-10-01T10:05:00.000Z'))).toBe(0);
  });
});

describe('formatCountdown', () => {
  it('reads as minutes and seconds, then as hours and minutes', () => {
    expect(formatCountdown(0)).toBe('0:00');
    expect(formatCountdown(65)).toBe('1:05');
    expect(formatCountdown(900)).toBe('15:00');
    expect(formatCountdown(3720)).toBe('1h 02m');
  });
});
