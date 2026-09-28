// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, asApiError, request } from '../../src/lib/api';
import { fail, ok, stubFetch } from '../helpers/fakeApi';

/** The same configured base the client uses, so these tests are about the envelope. */
const API_BASE = import.meta.env.VITE_API_BASE ?? '/api';

afterEach(() => vi.unstubAllGlobals());

describe('request', () => {
  it('unwraps the envelope and hands back the payload', async () => {
    stubFetch(() => ok({ booking: { id: 'b1' } }, 'Booking created'));

    const body = await request<{ message: string; booking: { id: string } }>('/bookings');

    expect(body.message).toBe('Booking created');
    expect(body.booking.id).toBe('b1');
  });

  it('throws an ApiError carrying the status, code and details', async () => {
    stubFetch(() => fail(409, 'CLASS_FULL', 'Not enough seats', { requested: 2, seatsAvailable: 1 }));

    const thrown = await request('/bookings').catch((err: unknown) => err);

    expect(thrown).toBeInstanceOf(ApiError);
    expect(thrown).toMatchObject({
      status: 409,
      code: 'CLASS_FULL',
      details: { requested: 2, seatsAvailable: 1 },
    });
  });

  it('returns undefined for a 204, which has no body to parse', async () => {
    stubFetch(() => new Response(null, { status: 204 }));

    await expect(request('/students/whatever')).resolves.toBeUndefined();
  });

  it('is same-origin, and only sets a JSON content-type when there is a body', async () => {
    const calls = stubFetch(() => ok({}));

    await request('/auth/me');
    expect(calls[0].url).toBe(`${API_BASE}/auth/me`);
    expect(calls[0].credentials).toBe('same-origin');
    expect(calls[0].headers.get('content-type')).toBeNull();

    await request('/bookings', { method: 'POST', body: '{}' });
    expect(calls[1].headers.get('content-type')).toBe('application/json');
  });

  it('keeps a caller-supplied header as well as the content-type', async () => {
    const calls = stubFetch(() => ok({}));

    await request('/bookings', { method: 'POST', body: '{}', headers: { 'x-demo': 'yes' } });

    expect(calls[0].headers.get('content-type')).toBe('application/json');
    expect(calls[0].headers.get('x-demo')).toBe('yes');
  });

  it('reports an unreachable server as an ApiError rather than a raw throw', () => {
    expect(asApiError(new TypeError('socket hang up'))).toMatchObject({ code: 'UNREACHABLE' });

    const original = new ApiError(409, 'SEAT_TAKEN', 'taken');
    expect(asApiError(original)).toBe(original);
  });
});
