import { Prisma } from '../generated/prisma/client';

/**
 * Money is a two-decimal value, and this file is the only place that rounds or
 * converts it. SQLite takes no `(10,2)` precision argument, so the rule is
 * enforced here rather than by the column.
 */
export function money(value: number | string | Prisma.Decimal): Prisma.Decimal {
  const amount = new Prisma.Decimal(value);

  if (!amount.isFinite() || amount.isNegative()) {
    throw new Error(`money: ${value} is not a non-negative amount`);
  }
  return amount.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/**
 * The single conversion for responses. It exists because a `Prisma.Decimal`
 * reaching `JSON.stringify` serializes as a *string*, which would quietly break
 * the number contract.
 */
export function moneyJson(value: Prisma.Decimal): number {
  return Number(money(value));
}

/** Exact decimal addition — never float maths — for a booking's stored total. */
export function sumMoney(values: Prisma.Decimal[]): Prisma.Decimal {
  return money(values.reduce((total, value) => total.plus(value), new Prisma.Decimal(0)));
}
