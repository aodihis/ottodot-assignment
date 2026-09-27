import { describe, expect, it } from 'vitest';
import { ApiError, errorBody } from '../../src/helpers/http';

describe('ApiError', () => {
  it('carries a status and a code, defaulting the message to the code', () => {
    const err = new ApiError(409, 'CLASS_FULL');

    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(409);
    expect(err.code).toBe('CLASS_FULL');
    expect(err.message).toBe('CLASS_FULL');
  });

  it('keeps an explicit message', () => {
    expect(new ApiError(403, 'FORBIDDEN', 'Admin only').message).toBe('Admin only');
  });
});

describe('errorBody', () => {
  it('wraps a code and message in the error envelope', () => {
    expect(errorBody('CLASS_FULL')).toEqual({
      error: { code: 'CLASS_FULL', message: 'CLASS_FULL' },
    });
    expect(errorBody('CLASS_FULL', 'No seats left')).toEqual({
      error: { code: 'CLASS_FULL', message: 'No seats left' },
    });
  });
});
