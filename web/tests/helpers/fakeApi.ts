import { vi } from 'vitest';

/**
 * Stubbing `fetch` is not optional here, for a concrete reason: Node's `fetch`
 * refuses a relative URL (`fetch('/api/classes')` throws "Failed to parse URL"),
 * and jsdom ships no `fetch` of its own — so a test cannot inherit a working one.
 * Stubbing it solves both, and keeps the suite offline.
 */

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

/** A success, in the `{message, ...payload}` envelope every endpoint uses. */
export const ok = (payload: Record<string, unknown> = {}, message = 'OK') =>
  json(200, { message, ...payload });

/** A failure, in the `{message, error:{code, details?}}` envelope. */
export const fail = (
  status: number,
  code: string,
  message = code,
  details?: Record<string, unknown>,
) => json(status, { message, error: { code, ...(details ? { details } : {}) } });

export type Call = {
  url: string;
  method: string;
  body: unknown;
  headers: Headers;
  credentials?: RequestCredentials;
};

/**
 * Answers every request through `handler`, and records what was asked for so a
 * test can assert on the request as well as the render.
 */
export function stubFetch(handler: (call: Call) => Response) {
  const calls: Call[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const call: Call = {
        url: String(input),
        method: init?.method ?? 'GET',
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
        headers: new Headers(init?.headers as HeadersInit | undefined),
        credentials: init?.credentials,
      };
      calls.push(call);
      return handler(call);
    }),
  );

  return calls;
}

/**
 * Answers by route rather than by call order, so a test states the API's shape
 * once and a view can make its requests in any order it likes.
 *
 * Keys are `"METHOD /path"`; a key with no method means `GET`. An unstubbed
 * route throws, so a view that starts calling something new fails loudly instead
 * of quietly rendering nothing.
 */
export function routeFetch(table: Record<string, () => Response>) {
  // Derived rather than literal, so a changed `VITE_API_BASE` moves the tests
  // with the code instead of failing them.
  const base = import.meta.env.VITE_API_BASE ?? '/api';

  return stubFetch((call) => {
    const path = call.url.startsWith(base) ? call.url.slice(base.length) : call.url;
    const handler =
      table[`${call.method} ${path}`] ?? (call.method === 'GET' ? table[path] : undefined);

    if (!handler) throw new Error(`unstubbed request: ${call.method} ${path}`);
    return handler();
  });
}
