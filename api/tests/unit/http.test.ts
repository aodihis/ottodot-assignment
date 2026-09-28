import { describe, expect, it } from 'vitest';
import { ApiError, errorBody, successBody } from '../../src/helpers/http';

describe('ApiError', () => {
  it('carries a status, a code, and optional details', () => {
    const err = new ApiError(409, 'CLASS_FULL');

    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(409);
    expect(err.code).toBe('CLASS_FULL');
    expect(err.message).toBe('CLASS_FULL');
    expect(err.details).toBeUndefined();
  });

  it('keeps an explicit message and details', () => {
    const err = new ApiError(409, 'SEAT_TAKEN', 'Those seats went', { seatsAvailable: 0 });

    expect(err.message).toBe('Those seats went');
    expect(err.details).toEqual({ seatsAvailable: 0 });
  });
});

describe('successBody', () => {
  it('puts the message first, then the named payload', () => {
    expect(successBody('OK', { children: [{ id: 'child_1' }] })).toEqual({
      message: 'OK',
      children: [{ id: 'child_1' }],
    });
  });

  it('allows several named keys — a message is always present, not the only key', () => {
    expect(successBody('OK', { user: { id: 'u1' }, students: [] })).toEqual({
      message: 'OK',
      user: { id: 'u1' },
      students: [],
    });
  });
});

describe('errorBody', () => {
  it('nests the code, defaults the message to it, and omits empty details', () => {
    expect(errorBody('CLASS_FULL')).toEqual({
      message: 'CLASS_FULL',
      error: { code: 'CLASS_FULL' },
    });
  });

  it('carries a human message and details when given', () => {
    expect(errorBody('CLASS_FULL', 'No seats left', { requested: 2, seatsAvailable: 1 })).toEqual({
      message: 'No seats left',
      error: { code: 'CLASS_FULL', details: { requested: 2, seatsAvailable: 1 } },
    });
  });
});
