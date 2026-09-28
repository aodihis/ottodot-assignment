# Trial class booking

A parent books a trial class for a child, pays (mock), and sees the status. An admin
sees each class's roster. Classes cap at **4 confirmed students**.

The point of the exercise is the invariants. No duplicate confirmed booking, no class
oversold, a failed payment that does not join the roster, and two parents racing for
the last seat where only one wins and the loser is never charged.

## How to run

Needs **Node 20.19+** (Vite 8 refuses older) and npm 10+. There is no database to
install, because SQLite is a file.

```bash
npm install

cp api/.env.example api/.env
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
#   paste the output into SESSION_SECRET in api/.env
cp web/.env.example web/.env

npm run reset     # create the database, migrate, load the demo data
npm run dev       # API on :3000, app on :4173
```

Open **http://localhost:4173**. While `npm run dev` is running, the API's reference
is at **http://localhost:3000/scalar**.

| | |
|---|---|
| `npm run dev` | API on :3000 and the app on :4173 |
| `npm test` | both suites, 157 API tests and 57 web tests |
| `npm run typecheck` | `tsc --noEmit`, then `svelte-check` |
| `npm run build` | build the app into `web/dist` |
| `npm run reset` / `npm run seed` | reseed the demo data (stop `npm run dev` first, it holds the file) |
| `npm run sweep` | retire lapsed holds, safe to re-run and cron-able |

Ports come from `api/.env` and `web/.env`. Each `.env.example` documents every key.

## What I built

**`api/`** is Hono with Prisma 7 over SQLite, and zod at the boundary. 16 endpoints,
8 models, session-cookie auth, and a mock payment gateway. Every route declares its
own OpenAPI document, so the reference at `/scalar` is generated from the code rather
than kept beside it.

**`web/`** is a Svelte 5 SPA. Four parent screens (class list, choose children, pay,
booking status), a login screen, and an admin roster view. No router or state library,
because the screens are named by the URL hash and that is what makes Back and refresh
work.

**Tests** number 214, split between 157 against the API (on a real SQLite database
rebuilt from the migrations each run) and 57 against the SPA.

## Test accounts

The password for all four is **`password123`**. The login screen lists them, so you can
click one rather than type it.

| Email | Role | Children |
|---|---|---|
| `parent1@demo.test` | parent | Alya, Bima |
| `parent2@demo.test` | parent | Citra |
| `parent3@demo.test` | parent | Dewi, Eka |
| `admin@demo.test` | admin | none, this account sees the rosters |

Registration works too, so you can make your own account.

## Test cases

The seed guarantees these four and **fails if it stops producing one**, so this table
cannot quietly become a lie. The check lives in `api/src/helpers/demoScenarios.ts`, and
the seed prints what it found. Sign in as **Nadia** (`parent1@demo.test`) for all four.

| Case | How to reach it |
|---|---|
| **A class with seats available** | Nothing to do. *Plants and How They Grow* and *Weather and Seasons* read 4 of 4 left, *Shapes Around Us* reads 3 of 4 |
| **A class with exactly 3 confirmed** | Nothing to do. *Fractions Made Easy* reads 1 of 4 left, with Alya, Citra and Dewi holding the three |
| **A duplicate booking for the same child and class** | Book *Fractions Made Easy*, tick **Alya**, then Continue. It is refused because she already has a seat. Untick her, tick **Bima**, and it goes through |
| **A payment failure** | Book any class and pay with `4000 0000 0000 0002`. The card is declined, the order becomes `payment_failed`, and no child joins the roster. Nadia's history already holds one too (Weather and Seasons, for Bima) |

Payment is mocked, and **the outcome comes from the card number, decided by the
server**. There is no success or failure switch in the UI. The test cards are:

| Card | Result |
|---|---|
| `4242 4242 4242 4242` | approved |
| `4000 0000 0000 0002` | declined as `card_declined` |
| `4000 0000 0000 9995` | declined as `insufficient_funds` |

The last-seat race is easiest to watch in two browsers. Sign in as Nadia and Rizky,
have both take a class's last seat, and pay in one of them. The second payment is
refused and never charged.

## Time spent

**4 hours 3 minutes**, measured between the first and last commit. Both are in this
repository, at 05:23 and 09:26 (UTC+7).

## Assumptions

- **One node, one SQLite connection.** The serialisation argument below depends on it,
  and it is the first thing to revisit on a different deployment.
- **A hold holds no seat.** Soft holds are what make the race reachable, so capacity is
  enforced at payment rather than at selection.
- **One class per order.** The API books one class for N children, not a mixed basket.
- **Every seat in an order costs the same**, so `amount = price × children`.
- **SGD, and it never varies.** A class carries a price but no currency, so the UI
  shows an amount without a code rather than inventing one.
- **The cancellation cutoff is a duration** of 5 days before the class, not calendar
  days.
- **Demo scale.** Five classes, and no pagination anywhere.
- **The browser's clock may be wrong without consequence**, because the countdown uses
  it and the server never does.

## Key architecture and backend decisions

### The approach

**Put the invariants in the database, and make the payment transaction the only place a
booking changes state.** The client never decides anything, and the server decides as
little as it can get away with. Anything a constraint or a single conditional statement
can decide is pushed down to one.

### Why

Every hard part of this brief is *two things happening at once*. A booking against an
existing registration, two orders for one last seat, a payment landing as another
payment lands. Check-then-act in application code is exactly what cannot be trusted
there, because the gap between the check and the act is the bug. A `UNIQUE` constraint,
a `CHECK`, and an `UPDATE ... WHERE` are atomic by definition, so they hold under
concurrency that no amount of care in a service layer would.

The second reason is the demo. A rule the database enforces can be proved by trying to
break it, and the suite does exactly that by inserting a raw duplicate and a raw
over-capacity update and asserting both are refused. A rule held in application code can
only be tested by reading it.

### The shape

**A booking is an order with line items.** `Booking` holds the customer, the timer, the
total and the state. `BookingItem` is one child's line. An `Enrollment` is the
registration, meaning "this child is in this class". It is written when a line is paid
and deleted when refunded, behind a plain `UNIQUE(studentId, classId)`. This shape makes
all-or-nothing, one payment per order, and the group race consequences of the model
rather than rules to remember. `TrialClass.confirmedCount` is a denormalised counter
rather than the truth, because the roster is the truth.

```
User ─1:1─ Parent
              ├─1:N─ Student
              │
              └─1:N─ Booking                    the order: customer, timer, total, status
                        │
                        ├─1:N─ BookingItem ──N:1── TrialClass
                        │          │
                        │          └─1:1─ Enrollment ──N:1──► TrialClass
                        │                the registration, meaning this child is in this class
                        │
                        └─1:N─ Payment           charges and refunds for the order
```

Both the line and the registration point at `TrialClass`, and that is the design. The
line records what was **sold**, the registration records what the child is **in**. One
is a commercial fact about an order and the other is the roster, and keeping them apart
is why "all the classes this child is registered for" is answerable without going
through bookings.

Not drawn, so the diagram stays readable: `Student` is the other side of *both*
`BookingItem` and `Enrollment`, so a child holds their own lines and their own
registrations.

`Enrollment` is the row a paid trial booking produces, and it is not the "regular
enrollment" the brief excludes. A class here is a single session with one `startsAt`
and one `durationMin`, there is no course or term, and no path to a seat other than
trial booking.

**Four booking statuses.** `pending_payment` is held but takes no seat. `confirmed` is
paid, with one enrollment per line. `payment_failed` registered nothing. `cancelled`
carries a reason, one of `expired`, `seat_taken`, `duplicate_booking` or
`parent_cancelled`.

**How each invariant is held:**

- **No duplicate registration.** `UNIQUE(studentId, classId)` in the database, with no
  status predicate, because a refunded registration is deleted rather than flagged. The
  service checks too, before the seat count, so the parent is told *which* child.
- **Never oversold past 4.** A `CHECK (confirmedCount BETWEEN 0 AND capacity)` added by
  hand in a migration, plus a conditional atomic update
  (`SET confirmedCount = confirmedCount + n WHERE confirmedCount <= capacity - n`).
  Zero rows changed means it did not fit, and the transaction throws. A count-then-write
  would race. Everything runs on one synchronous SQLite connection, so two payments are
  serialised by construction.
- **The race resolves to one winner.** The seats are claimed only at payment, inside one
  transaction, by a conditional status transition
  (`WHERE id = ? AND status = 'pending_payment'`). Whoever wins that write takes the
  seats, and the loser's zero-row update is the signal.
- **A failed payment never joins the roster.** The charge is decided **before** the seat
  guard, so the last-seat loser is never charged and there is no refund to issue. A
  declined card writes a failed `Payment` row.
- **Lapsed holds retire themselves.** There is no background job. Expiry is lazy, so any
  operation that touches a booking first retires lapsed ones, idempotently. `npm run
  sweep` does the same on a schedule.
- **Money** is a decimal at 2 dp, sent as a JSON number. **Time** is UTC everywhere,
  with durations in milliseconds rather than calendar arithmetic.

**Where each check lives.** The UI never decides anything:

| Check | Where |
|---|---|
| Request shape, email format, password length, Luhn on the card | API, in zod |
| "This child is yours and not removed" | API, because it needs the session |
| "Already registered in this class" | Database `UNIQUE`, re-checked in the payment transaction |
| "Never more than 4 confirmed" | Database `CHECK` plus the conditional update |
| "Only one of two racing payments wins" | Database, by the conditional claim |
| "Enough seats for this order", before payment | API. A fast refusal, while payment stays authoritative |
| Whether the card succeeds | API, from the mock gateway and the number |
| "Is paying still on offer?" | UI displays, API decides. The UI may only *withhold* the button |
| Cancellation window | API |
| Retiring lapsed holds | The sweep |

The UI computes exactly one time-based thing, the hold countdown, and it is the same
comparison the server makes against the server's own `expiresAt`. It reads one shared
clock so the countdown and the offer to pay cannot disagree. It can hide the pay button
early, and it can never confirm, cancel or release anything.

### The sweep

The sweep exists so a lapsed selection stops claiming to be payable.

Note what it does **not** do, because the name suggests otherwise: it releases no seat.
A selection never held one, since seats are taken at payment and given back by a refunded
cancel, so expiring a selection changes no seat count. The command says as much when it
runs.

It is also not the enforcement path. Every read and every guard is predicate-based, so a
lapsed selection is already untrustworthy whether or not the sweep has run. What it adds
is that the stored status becomes honest, which matters for the case where nobody reads
the booking at all, and a cron entry can run it on a schedule.

To watch it work:

1. Set `BOOKING_HOLD_MINUTES=1` in `api/.env`, then restart `npm run dev`.
2. Book any class. You get a hold that lapses after a minute.
3. Wait a minute, then run `npm run sweep`.

It reports `Retired 1 lapsed selection(s). Availability is unchanged: a selection never
held a seat.` The booking then reads as cancelled with the reason `expired`. Paying is
refused either way, as `BOOKING_EXPIRED` before the sweep and `BOOKING_NOT_PAYABLE`
after it.

### Tradeoffs accepted

Every decision above bought something and cost something. The costs:

| Decision | What it bought | What it cost |
|---|---|---|
| **Soft holds**, so a selection reserves no seat | the last-seat race is reachable at all, and that race is the thing being graded | the sad path is real, so a parent can select a seat and then be told they lost it. A hard hold would remove that, and make the race impossible |
| **The capacity guard is one conditional `UPDATE`**, serialised by the single SQLite connection | atomic by definition, with no lock to write or reason about | correctness rests on a *deployment* property. Moving to Postgres would need this re-reasoned, not just re-run |
| **The charge is decided before the seat guard** | the loser is never charged, so there is no refund for a service that was not delivered | a valid card is checked against a seat that may not fit, so the refusal arrives after the money was authorised |
| **Expiry is lazy**, with `npm run sweep` for the scheduled case | no scheduler to deploy, monitor or alert on | a lapsed hold stays visible until something reads it, so a quiet system retires holds slowly |
| **An explicit `Enrollment` row** | the duplicate rule needs no status predicate, and "classes this child is in" is a direct read | an extra table, plus a denormalised counter that has to be kept in step with it |
| **One class per order, all-or-nothing** | the atomic claim is one test rather than a per-class map, and a failure needs no compensating writes | a parent who wants one child out of a two-child order must cancel and rebook |
| **Decimals for money** | values are legible when reading the database by hand | the 2-decimal rule is enforced in code because SQLite takes no `(10,2)`, and JSON drops trailing zeros, so `50.00` arrives as `50` |
| **UTC everywhere, durations not calendar days** | no DST or timezone edge cases at all | "5 days before the class" ignores business calendars, so holidays and teaching weeks are not modelled |
| **Routes declare their own OpenAPI** | the reference cannot drift from the code, and response shapes are compiler-checked | a larger diff across four route modules than annotating them would have been |
| **No router or state library in the SPA** | four screens and one store do not justify either | Back and refresh rest on a hand-rolled hash route, which is code to own |

### Two deployables

The API never serves the SPA. They meet only at the Vite dev proxy, which keeps every
request same-origin. That is why there is no CORS middleware and the cookie is
`SameSite=Lax`. Serving them from different origins would break both, and would need
either a reverse proxy in front so the browser still sees one origin, or CORS with
credentials plus `SameSite=None` and `Secure`.

## What I deliberately cut

- **Real payments.** Mock only, so no provider, no webhooks, no idempotency keys, and no
  refund or abuse policy.
- **Complex login and registration.** No email verification, no password reset, and no
  refresh-token rotation.
- **Proper security hardening.** No CORS setup, no rate limiting, no CSRF tokens.
  `SameSite=Lax` is the only CSRF protection, which is enough for a same-origin demo and
  not enough for a real deployment.
- **Admin CRUD.** Nothing can be created or edited. Classes, children and rosters are
  seeded or read-only from the admin side.
- **Class management.** No updating a class, no adding details to one, no teacher
  assignment, and no closing enrolment.
- **Caching**, at any layer.
- **Logging.** There is no logger library and no request logging, so the only output is
  `console.error` for an unhandled error in `api/src/app.ts`, plus the startup and CLI
  lines. There are no levels and no request ids, so nothing ties together the calls that
  touched one booking, which is what reconstructing a race needs. Errors are not lost,
  because they are mapped to the right status and returned in the envelope. They are
  simply not recorded.
- **Observability** beyond that, so no metrics, no tracing, and no health endpoint.
- Also out of scope: background or scheduled expiry (lazy plus sweep instead), baskets
  across multiple classes, partial cancellation of one child out of an order, pagination,
  a component library, animations, end-to-end browser tests in CI, and deployment
  manifests.

## What I would monitor after release

1. **The counter invariant.** `SUM(confirmedCount)` against `COUNT(enrollments)` per
   class. They must be equal, so any drift is a correctness bug, and it is the cheapest
   thing to alarm on. The same applies to every `CHECK` and `UNIQUE` violation, since
   those should be unreachable and each one is a defect rather than noise.
2. **The `SEAT_TAKEN` rate**, which measures the race being lost in the wild. A rise
   means contention went up or the hold timer is too short.
3. **The payment funnel**, meaning holds created, then paid, then confirmed, with the
   drop at each step split by failure code. A `BOOKING_EXPIRED` at pay means people are
   being given less time than they need.
4. **Sweep health.** Alert on it *not running*, not merely on it erroring. It is the only
   thing releasing holds for parents who never come back, and its absence shows up as
   classes that look full while the roster is empty.
5. **Refund and cancellation rates**, and how close to the cutoff they happen, to see
   whether 5 days is where parents actually want it.
6. **Latency of `GET /api/classes`**, because it counts live holds per class and is the
   read most likely to degrade first.
7. **5xx and 401/403 rates by route.** A `FORBIDDEN` spike usually means the frontend is
   asking for something the session cannot do.

Most of the above needs something this build does not have, which is structured request
logs with a request id so one booking can be followed across the calls that touched it.
Until that exists, a race can only be inferred from counters rather than read from a log,
which is why it is the first item under "next".

## What I would do next with more time

1. **Structured logging**, with a request id threaded through the booking transaction.
   Every question in the section above is easier to answer with it. It is the cheapest of
   these to add and the one that makes the rest observable.
2. **A background expiry job**, so expiry does not depend on someone visiting. `sweep`
   already exists to be its body.
3. **A real payment integration** with webhook reconciliation, which changes the confirm
   path from one transaction into something that must tolerate arriving twice.
4. **A Playwright test of the race in two browser contexts.** The invariant is proved at
   the API level today. This would prove the *experience* of losing, which is what a human
   is asked to judge.
5. **Show a child's enrolled classes in the UI.** `GET /api/students/:id/enrollments`
   exists and nothing consumes it.
6. **Partial cancellation**, so one child can come out of a multi-child order. The model
   supports it and the order's all-or-nothing state is what blocks it.
7. **Class management**, meaning create and edit classes and assign a teacher.
8. **A generated API client** from the OpenAPI document, replacing the hand-kept types in
   `web/src/lib/types.ts`.
9. **Auth and security hardening**, meaning verification, reset, rate limiting and CSRF.
10. **Deployment**, with a container each behind a reverse proxy, which is also what
    resolves the cookie and CORS constraint.

See `AI_USAGE.md` for how this was built with AI, where it was corrected, and how the
result was verified.
