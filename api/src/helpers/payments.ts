/**
 * The mock gateway. Success is derived from the card number the way a real
 * gateway's test cards work, so the API's success path is never self-reported:
 * a caller cannot declare that a charge succeeded.
 */

/**
 * The brands `brandOf` can report. A tuple rather than a bare union so the API
 * contract can derive its enum from the same list the classifier does.
 */
export const CARD_BRANDS = ['visa', 'mastercard', 'amex', 'discover', 'unknown'] as const;

export type CardBrand = (typeof CARD_BRANDS)[number];

export type MaskedCard = { brand: CardBrand; last4: string; holder?: string };

export type CardOutcome =
  | { kind: 'approved' }
  | { kind: 'declined'; reason: 'card_declined' | 'insufficient_funds' }
  | { kind: 'invalid' };

/** Test cards, matching the conventions every gateway uses. */
const DECLINE_REASONS: Record<string, 'card_declined' | 'insufficient_funds'> = {
  '4000000000000002': 'card_declined',
  '4000000000009995': 'insufficient_funds',
};

export function normalizeCardNumber(input: string): string {
  return input.replace(/[\s-]/g, '');
}

/** The check-digit algorithm every card number satisfies. */
export function isLuhnValid(digits: string): boolean {
  if (!/^\d{12,19}$/.test(digits)) return false;

  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let value = Number(digits[i]);
    if (double) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    sum += value;
    double = !double;
  }
  return sum % 10 === 0;
}

export function evaluateCard(digits: string): CardOutcome {
  if (!isLuhnValid(digits)) return { kind: 'invalid' };

  const decline = DECLINE_REASONS[digits];
  return decline ? { kind: 'declined', reason: decline } : { kind: 'approved' };
}

function brandOf(digits: string): CardBrand {
  if (/^4/.test(digits)) return 'visa';
  if (/^5[1-5]/.test(digits) || /^2[2-7]/.test(digits)) return 'mastercard';
  if (/^3[47]/.test(digits)) return 'amex';
  if (/^6(?:011|5)/.test(digits)) return 'discover';
  return 'unknown';
}

/**
 * The only function that sees a full card number, and it returns at most the
 * last four digits — nothing else may hold or store the PAN.
 */
export function maskCard(digits: string, holder?: string): MaskedCard {
  return {
    brand: brandOf(digits),
    last4: digits.slice(-4),
    ...(holder ? { holder } : {}),
  };
}
