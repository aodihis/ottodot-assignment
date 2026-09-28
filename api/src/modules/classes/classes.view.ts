import type { TrialClass } from '../../generated/prisma/client';
import { cancellationDeadline } from '../../helpers/config';
import { moneyJson } from '../../helpers/money';
import { seatsAvailable } from '../../helpers/seats';

/**
 * The class payload, shared by the classes endpoints and by the students module's
 * enrollment listing — which is why it is a view of its own rather than a
 * function inside one module's service that another module reaches into.
 *
 * Holds are soft: a `pending_payment` booking never consumes a seat, so
 * availability is capacity minus confirmed. `pendingHolds` and
 * `cancellationDeadline` are served to parents and admins alike — the parent UI
 * uses them too ("n selections are competing for this seat", "cancel until ...").
 */
export function classView(cls: TrialClass, pendingHolds: number) {
  return {
    ...classSummary(cls),
    capacity: cls.capacity,
    confirmedCount: cls.confirmedCount,
    pendingHolds,
    seatsAvailable: seatsAvailable(cls),
    cancellationDeadline: cancellationDeadline(cls.startsAt),
  };
}

/** The class fields both the class list and a child's enrollments need. */
export function classSummary(cls: TrialClass) {
  return {
    id: cls.id,
    title: cls.title,
    description: cls.description,
    subject: cls.subject,
    startsAt: cls.startsAt,
    durationMin: cls.durationMin,
    price: moneyJson(cls.price),
  };
}
