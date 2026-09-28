import type { ContentfulStatusCode } from 'hono/utils/http-status';

/** Thrown by route handlers; mapped to the error envelope by `app.onError`. */
export class ApiError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message?: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message ?? code);
    this.name = 'ApiError';
  }
}

/**
 * Every success response is `{ message, ...namedKeys }` — the message first, then
 * whatever the endpoint is about (`booking`, `children`, …). Endpoints that
 * answer 204 correctly carry no body at all.
 */
export function successBody<T extends Record<string, unknown>>(message: string, data: T) {
  return { message, ...data };
}

/** Every failure is `{ message, error: { code, details? } }`. */
export function errorBody(code: string, message?: string, details?: Record<string, unknown>) {
  return {
    message: message ?? code,
    error: { code, ...(details ? { details } : {}) },
  };
}
