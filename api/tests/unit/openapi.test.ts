import { z } from '@hono/zod-openapi';
import { describe, expect, it } from 'vitest';
import { errorBody, successBody } from '../../src/helpers/http';
import { ErrorResponseSchema, successResponse } from '../../src/helpers/openapi';

/**
 * The schemas in `helpers/openapi.ts` describe the bodies `helpers/http.ts`
 * builds. A *success* body is checked by the compiler at every handler that
 * returns one, but an error body is only ever thrown and rendered by `onError`,
 * so nothing would notice the two drifting apart. This is that notice.
 *
 * Each case asserts the rejection too: a schema loose enough to accept anything
 * would pass the positive half on its own.
 */
describe('the declared schemas match the bodies the envelope builds', () => {
  it('describes an error body, and rejects a success body', () => {
    const errorBodies = [
      errorBody('CARD_DECLINED', 'The card was declined'),
      errorBody('BOOKING_NOT_FOUND', 'No such booking'),
      errorBody('VALIDATION_ERROR', 'name: too small', { issues: [{ path: ['name'] }] }),
    ];

    for (const body of errorBodies) {
      expect(ErrorResponseSchema.safeParse(body).success, JSON.stringify(body)).toBe(true);
    }

    expect(ErrorResponseSchema.safeParse(successBody('Child added', { student: { id: 's1' } })).success).toBe(false);
  });

  it('describes a success body, and rejects an error body', () => {
    const student = z.object({ id: z.string(), name: z.string() });
    const schema = successResponse({ student }, 'Child added').content['application/json'].schema;

    const success = successBody('Child added', { student: { id: 's1', name: 'Alya' } });
    expect(schema.safeParse(success).success).toBe(true);

    // The message is the one part every success shares, so dropping it must fail.
    expect(schema.safeParse({ student: { id: 's1', name: 'Alya' } }).success).toBe(false);
    expect(schema.safeParse(errorBody('STUDENT_NOT_FOUND', 'No such child')).success).toBe(false);
  });
});
