import type { Booking, Child, ClassRoster, ClassView, Payment, User } from './types';

/**
 * A failed request, carrying what the API said about it. `details` is not
 * decoration: several failures (`SEAT_TAKEN`, `CARD_DECLINED`, …) put the whole
 * booking and payment attempt in there, which is what lets a failure screen
 * render without asking the server again.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Where the API lives, from `web/.env` (`VITE_API_BASE`; see `.env.example`).
 * It is a path by default, which keeps every call same-origin — that is what lets
 * the session cookie work with no CORS middleware on the server.
 */
const API_BASE = import.meta.env.VITE_API_BASE ?? '/api';

/**
 * Every call goes through here. It exists to own three things so nothing else
 * has to: the same-origin cookie, the `{message, ...payload}` envelope, and
 * turning a failure body into a typed error.
 *
 * Note the header order. Spreading `init` after the computed `headers` key would
 * silently drop `content-type` for any caller that passes a header of its own.
 */
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...init.headers,
    },
    credentials: 'same-origin',
  });

  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(
      res.status,
      body?.error?.code ?? 'UNKNOWN',
      body?.message ?? 'Something went wrong',
      body?.error?.details,
    );
  }

  return body as T;
}

/** A thrown value that is not an `ApiError` — a dropped connection, or a bug. */
export function asApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  return new ApiError(0, 'UNREACHABLE', 'Could not reach the server');
}

const json = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

export const whoAmI = () =>
  request<{ user: User; parent: { id: string } | null; students: Child[] }>('/auth/me');

export const login = (email: string, password: string) =>
  request<{ user: User }>('/auth/login', json({ email, password }));

export const register = (email: string, password: string, name: string) =>
  request<{ user: User }>('/auth/register', json({ email, password, name }));

export const logout = () => request<void>('/auth/logout', { method: 'POST' });

export const listChildren = () => request<{ students: Child[] }>('/students');

export const addChild = (name: string) => request<{ student: Child }>('/students', json({ name }));

export const removeChild = (id: string) => request<void>(`/students/${id}`, { method: 'DELETE' });

export const listClasses = () => request<{ classes: ClassView[] }>('/classes');

export const listAdminClasses = () => request<{ classes: ClassView[] }>('/admin/classes');

export const listRoster = (classId: string) =>
  request<ClassRoster>(`/admin/classes/${classId}/roster`);

export const listMyBookings = () => request<{ bookings: Booking[] }>('/bookings');

export const getBooking = (id: string) => request<{ booking: Booking }>(`/bookings/${id}`);

export const createBooking = (classId: string, studentIds: string[]) =>
  request<{ booking: Booking }>('/bookings', json({ classId, studentIds }));

export const payBooking = (id: string, card: { number: string; holder?: string }) =>
  request<{ booking: Booking; payment: Payment | null }>(`/bookings/${id}/pay`, json({ card }));

export const cancelBooking = (id: string) =>
  request<{ booking: Booking; refund: Payment | null }>(`/bookings/${id}/cancel`, { method: 'POST' });
