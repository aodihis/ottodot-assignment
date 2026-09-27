import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_CANCELLATION_CUTOFF_DAYS,
  cancellationCutoffDays,
  cancellationDeadline,
  sessionSecret,
} from '../../src/helpers/config';

afterEach(() => vi.unstubAllEnvs());

describe('cancellation cutoff', () => {
  it('falls back to the default when unset or blank', () => {
    vi.stubEnv('CANCELLATION_CUTOFF_DAYS', '');
    expect(cancellationCutoffDays()).toBe(DEFAULT_CANCELLATION_CUTOFF_DAYS);
  });

  it('reads the configured value', () => {
    vi.stubEnv('CANCELLATION_CUTOFF_DAYS', '1');
    expect(cancellationCutoffDays()).toBe(1);
  });

  it('reads at call time, so a change applies without a restart', () => {
    vi.stubEnv('CANCELLATION_CUTOFF_DAYS', '3');
    expect(cancellationCutoffDays()).toBe(3);

    vi.stubEnv('CANCELLATION_CUTOFF_DAYS', '10');
    expect(cancellationCutoffDays()).toBe(10);
  });

  it('rejects a negative or non-numeric value instead of guessing', () => {
    vi.stubEnv('CANCELLATION_CUTOFF_DAYS', '-1');
    expect(() => cancellationCutoffDays()).toThrow();

    vi.stubEnv('CANCELLATION_CUTOFF_DAYS', 'soon');
    expect(() => cancellationCutoffDays()).toThrow();
  });

  it('subtracts a duration from the start time, not calendar days', () => {
    vi.stubEnv('CANCELLATION_CUTOFF_DAYS', '5');

    expect(cancellationDeadline(new Date('2026-01-10T10:00:00.000Z')).toISOString()).toBe(
      '2026-01-05T10:00:00.000Z',
    );
  });

  it('a cutoff of 0 closes the window exactly when the class starts', () => {
    vi.stubEnv('CANCELLATION_CUTOFF_DAYS', '0');
    const startsAt = new Date('2026-01-10T10:00:00.000Z');

    expect(cancellationDeadline(startsAt).toISOString()).toBe(startsAt.toISOString());
  });
});

describe('session secret', () => {
  it('uses the configured secret', () => {
    vi.stubEnv('SESSION_SECRET', 'a-real-secret');
    expect(sessionSecret()).toBe('a-real-secret');
  });

  it('fails closed when unset or blank, rather than signing with a published default', () => {
    vi.stubEnv('SESSION_SECRET', '');
    expect(() => sessionSecret()).toThrow(/SESSION_SECRET/);

    vi.stubEnv('SESSION_SECRET', '   ');
    expect(() => sessionSecret()).toThrow(/SESSION_SECRET/);
  });
});
