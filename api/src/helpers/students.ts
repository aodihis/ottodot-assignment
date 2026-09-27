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
