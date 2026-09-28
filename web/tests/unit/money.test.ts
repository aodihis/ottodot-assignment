// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { formatMoney } from '../../src/lib/money';

describe('formatMoney', () => {
  it('keeps two decimal places, because the API sends `50` for SGD 50.00', () => {
    expect(formatMoney(50, 'SGD')).toBe('SGD 50.00');
    expect(formatMoney(100, 'SGD')).toBe('SGD 100.00');
    expect(formatMoney(37.5, 'SGD')).toBe('SGD 37.50');
  });

  it('omits the currency when the payload does not carry one', () => {
    // A class payload has a price but no currency, and inventing one here would
    // be the UI stating a fact it was not given.
    expect(formatMoney(50)).toBe('50.00');
  });
});
