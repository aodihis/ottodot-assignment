import { z } from '@hono/zod-openapi';

/**
 * The OpenAPI side of the response envelope. `helpers/http.ts` builds the bodies
 * and this file describes them; declaring them is what makes `@hono/zod-openapi`
 * check each handler's return against its route, so the reference and the
 * responses cannot drift apart silently.
 *
 * `z` is imported from `@hono/zod-openapi` rather than `zod`: it is the same
 * instance, but this one is guaranteed to have had `extendZodWithOpenApi`
 * applied when the package loaded.
 */

/** `{message, error:{code, details?}}` — the shape `errorBody` builds. */
export const ErrorResponseSchema = z
  .object({
    message: z.string(),
    error: z.object({
      code: z.string(),
      details: z.record(z.string(), z.unknown()).optional(),
    }),
  })
  .openapi('ErrorResponse');

/** A failure response. Every error status on every route is this same envelope. */
export function errorResponse(description: string) {
  return {
    content: { 'application/json': { schema: ErrorResponseSchema } },
    description,
  };
}

/** A success response: the `message` every endpoint sends, plus its named keys. */
export function successResponse(shape: z.ZodRawShape, description = 'OK') {
  return {
    content: { 'application/json': { schema: z.object({ message: z.string(), ...shape }) } },
    description,
  };
}

/** A JSON request body. Everything the API accepts is JSON, and always required. */
export function jsonBody<T extends z.ZodType>(schema: T, description?: string) {
  return { content: { 'application/json': { schema } }, required: true, description };
}

/**
 * The `:id` in a `/{id}` path. Declared even though it is plainly a string: a
 * path template with no matching parameter is a malformed document, and the
 * reference would show the placeholder without saying what fills it.
 */
export const IdParamSchema = z.object({ id: z.string() });
