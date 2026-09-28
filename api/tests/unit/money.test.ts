import { describe, expect, it } from 'vitest';
import { Prisma } from '../../src/generated/prisma/client';
import { money, moneyJson, sumMoney } from '../../src/helpers/money';

describe('money', () => {
  it('rounds to two decimal places', () => {
    expect(money(12.345).toFixed(2)).toBe('12.35'); // half-up
    expect(money('50').toFixed(2)).toBe('50.00');
    expect(money(49.999).toFixed(2)).toBe('50.00');
  });

  it('rejects negative and non-finite amounts rather than storing them', () => {
    expect(() => money(-1)).toThrow();
    expect(() => money(Number.NaN)).toThrow();
    expect(() => money(Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe('moneyJson', () => {
  it('returns a plain number, because a Decimal would serialize as a string', () => {
    const value = moneyJson(new Prisma.Decimal('50.00'));

    expect(value).toBe(50);
    expect(typeof value).toBe('number');
  });

  it('survives JSON round-tripping as a number', () => {
    const payload = JSON.parse(JSON.stringify({ price: moneyJson(new Prisma.Decimal('12.35')) }));

    expect(payload.price).toBe(12.35);
    expect(typeof payload.price).toBe('number');
  });
});

describe('sumMoney', () => {
  it('adds exactly — the reason money is a decimal and not a float', () => {
    expect(sumMoney([money(0.1), money(0.2)]).toFixed(2)).toBe('0.30');
    expect(sumMoney([money(50), money(60), money(50)]).toFixed(2)).toBe('160.00');
  });

  it('is zero for no items', () => {
    expect(sumMoney([]).toFixed(2)).toBe('0.00');
  });
});
