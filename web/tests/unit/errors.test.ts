// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { describeFailure } from '../../src/lib/errors';

describe('describeFailure', () => {
  it('reads the numbers the server sent for the codes that need them', () => {
    const full = describeFailure({
      code: 'CLASS_FULL',
      message: 'Not enough seats',
      details: { requested: 2, seatsAvailable: 1 },
    });

    expect(full.title).toMatch(/not enough seats/i);
    expect(full.detail).toContain('2');
    expect(full.detail).toContain('1');
  });

  it('tells the parent they were not charged when the seats went first', () => {
    const taken = describeFailure({ code: 'SEAT_TAKEN', message: '', details: { seatsAvailable: 0 } });

    expect(taken.detail?.toLowerCase()).toContain('not charged');
  });

  it('offers the retry that matches whether the hold survived', () => {
    // A malformed card is refused before the transaction, so the hold is still live.
    expect(describeFailure({ code: 'INVALID_CARD', message: '' }).actions).toEqual(['pay-again']);
    // A declined card retires the order, so the next attempt is a fresh selection.
    expect(describeFailure({ code: 'CARD_DECLINED', message: '', details: {} }).actions).toEqual([
      'book-again',
    ]);
  });

  it('distinguishes insufficient funds from a plain decline', () => {
    const funds = describeFailure({
      code: 'CARD_DECLINED',
      message: '',
      details: { reason: 'insufficient_funds' },
    });
    const plain = describeFailure({
      code: 'CARD_DECLINED',
      message: '',
      details: { reason: 'card_declined' },
    });

    expect(funds.detail).toMatch(/insufficient funds/i);
    expect(plain.detail).toMatch(/^Card declined/i);
  });

  it('falls back to the server message for a code it does not know', () => {
    const unknown = describeFailure({ code: 'SOMETHING_NEW', message: 'An odd thing happened' });

    expect(unknown.title).toBe('An odd thing happened');
    expect(unknown.actions).toEqual(['refresh']);
  });
});
