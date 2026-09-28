import { describe, expect, it } from 'vitest';
import { evaluateCard, isLuhnValid, maskCard, normalizeCardNumber } from '../../src/helpers/payments';

const SUCCESS_CARD = '4242424242424242';
const DECLINED_CARD = '4000000000000002';
const INSUFFICIENT_CARD = '4000000000009995';

describe('isLuhnValid', () => {
  it('accepts the canonical test card', () => {
    expect(isLuhnValid(SUCCESS_CARD)).toBe(true);
  });

  it('rejects a number that fails the check digit', () => {
    expect(isLuhnValid('4242424242424241')).toBe(false);
  });

  it('rejects numbers that are too short or not digits', () => {
    expect(isLuhnValid('4242')).toBe(false);
    expect(isLuhnValid('424242424242424x')).toBe(false);
  });
});

describe('evaluateCard', () => {
  it('approves a well-formed card', () => {
    expect(evaluateCard(SUCCESS_CARD)).toEqual({ kind: 'approved' });
  });

  it('declines the test cards and says why', () => {
    expect(evaluateCard(DECLINED_CARD)).toEqual({ kind: 'declined', reason: 'card_declined' });
    expect(evaluateCard(INSUFFICIENT_CARD)).toEqual({
      kind: 'declined',
      reason: 'insufficient_funds',
    });
  });

  it('reports a malformed number as invalid rather than declining it', () => {
    expect(evaluateCard('4242424242424241')).toEqual({ kind: 'invalid' });
  });
});

describe('normalizeCardNumber', () => {
  it('accepts how people actually type card numbers', () => {
    expect(normalizeCardNumber('4242 4242 4242 4242')).toBe(SUCCESS_CARD);
    expect(normalizeCardNumber('4242-4242-4242-4242')).toBe(SUCCESS_CARD);
  });
});

describe('maskCard', () => {
  it('returns the brand, the last four digits, and the holder', () => {
    expect(maskCard(SUCCESS_CARD, 'Nadia')).toEqual({
      brand: 'visa',
      last4: '4242',
      holder: 'Nadia',
    });
    expect(maskCard(SUCCESS_CARD).holder).toBeUndefined();
  });

  it('recognises the common brands', () => {
    expect(maskCard('5555555555554444').brand).toBe('mastercard');
    expect(maskCard('378282246310005').brand).toBe('amex');
    expect(maskCard('6011111111111117').brand).toBe('discover');
    expect(maskCard('9999999999999999').brand).toBe('unknown');
  });

  it('never carries more than four consecutive digits — no PAN survives masking', () => {
    for (const number of [SUCCESS_CARD, DECLINED_CARD, '5555555555554444', '378282246310005']) {
      const masked = JSON.stringify(maskCard(number, 'Nadia'));

      expect(masked).not.toContain(number);
      expect(masked).not.toMatch(/\d{5,}/);
    }
  });
});
