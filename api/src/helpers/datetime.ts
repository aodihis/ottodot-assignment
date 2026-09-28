/**
 * Every timestamp this app stores or returns is an absolute UTC instant, no
 * matter where the server runs. Prisma stores SQLite `DateTime` as ISO-8601 TEXT
 * carrying an explicit offset (verified in the database, and not the `NUMERIC`
 * the docs' mapping table claims), and `JSON.stringify` renders a `Date` with
 * `Z`. Nothing accepts a caller-supplied timestamp, so the one seam that matters
 * is where "now" comes from.
 */

/** The single "now" — booking creation, expiry checks and the sweep all read it here. */
export function utcNow(): Date {
  return new Date();
}
