import type { ContentfulStatusCode } from 'hono/utils/http-status';

/** Thrown by route handlers; mapped to the error envelope by `app.onError`. */
export class ApiError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'ApiError';
  }
}

export function errorBody(code: string, message?: string) {
  return { error: { code, message: message ?? code } };
}
