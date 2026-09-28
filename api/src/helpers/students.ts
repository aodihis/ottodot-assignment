import { z } from '@hono/zod-openapi';

/**
 * A child as the API reports them — the `{id, name}` every endpoint that
 * mentions one selects. Shared here rather than declared per module because the
 * auth module's `/me` and the students module both serve it.
 */
export const StudentRefSchema = z.object({ id: z.string(), name: z.string() });

/**
 * Children are soft-deleted (`Student.removedAt`), so every lookup of "this
 * parent's children" must exclude removed rows — a missed filter would let a
 * removed child be booked. The rule lives here, as a fragment that composes both
 * at the top level and inside a relation filter.
 */
export const childScope = { removedAt: null };

/** The same rule scoped to one parent. */
export function activeStudentWhere(parentId: string) {
  return { parentId, ...childScope };
}

/**
 * The same rule for a row already loaded — the booking and child-removal paths
 * hold the students in hand and cannot ask the database again. Each caller maps
 * "not active" to its own code (a booking names someone else's child *or* a
 * removed one as not-yours; a child list has no such child at all), which is a
 * decision made at the call site rather than a difference between two helpers.
 */
export function isActiveChild(student: { removedAt: Date | null }): boolean {
  return student.removedAt === null;
}
