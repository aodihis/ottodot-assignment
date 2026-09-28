# Trial class booking

A parent books a trial class for a child, pays (mock), and sees the status. An admin
sees each class's roster. Classes cap at **4 confirmed students**.

The point of the exercise is the invariants: no duplicate confirmed booking, no
class oversold, a failed payment that does not join the roster, and two parents
racing for the last seat where only one wins and the loser is never charged.

## How to run

Needs **Node 20.19+** (Vite 8 refuses older) and npm 10+. No database to install —
SQLite is a file.

```bash
npm install

cp api/.env.example api/.env
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
#   paste the output into SESSION_SECRET in api/.env
cp web/.env.example web/.env

npm run reset     # create the database, migrate, load the demo data
npm run dev       # API on :3000, app on :4173
```

Open **http://localhost:4173**. The API's reference is at
**http://localhost:3000/scalar** while `npm run dev` is running.

| | |
|---|---|
| `npm run dev` | API on :3000 and the app on :4173 |
| `npm test` | both suites — 157 API + 57 web |
| `npm run typecheck` | `tsc --noEmit`, then `svelte-check` |
| `npm run build` | build the app into `web/dist` |
| `npm run reset` / `npm run seed` | reseed the demo data (stop `npm run dev` first — it holds the file) |
| `npm run sweep` | retire lapsed holds (safe to re-run; cron-able) |

Ports come from `api/.env` and `web/.env`; each `.env.example` documents every key.

## What I built

**`api/`** — Hono + Prisma 7 + SQLite, zod at the boundary. 16 endpoints, 8 models,
session-cookie auth, and a mock payment gateway. Every route declares its own
OpenAPI document, so the reference at `/scalar` is generated from the code rather
than kept beside it.

**`web/`** — a Svelte 5 SPA. Four parent screens (class list, choose children, pay,
booking status), a login screen, and an admin roster view. No router or state
library; the screens are named by the URL hash, which is what makes Back and refresh
work.

**Tests** — 214: 157 against the API (on a real SQLite database rebuilt from the
migrations each run) and 57 against the SPA.

## Test accounts

Password for all four: **`password123`**. The login screen lists them, so you can
click one rather than type.

| Email | Role | Children |
|---|---|---|
| `parent1@demo.test` | parent | Alya, Bima |
| `parent2@demo.test` | parent | Citra |
| `parent3@demo.test` | parent | Dewi, Eka |
| `admin@demo.test` | admin | — (sees the rosters) |

Registration works too, so you can make your own account.

## Test cases

The seed guarantees these and **fails if it stops producing one** — a seed that
quietly drops a case would leave this table lying. Checked in
`api/src/helpers/demoScenarios.ts`; the seed prints what it found. Sign in as
**Nadia** (`parent1@demo.test`) for all four.

| Case | How to reach it |
|---|---|
| **A class with seats available** | Nothing to do — *Plants and How They Grow* and *Weather and Seasons* read 4 of 4 left, *Shapes Around Us* 3 of 4 |
| **A class with exactly 3 confirmed** | Nothing to do — *Fractions Made Easy* reads 1 of 4 left (Alya, Citra, Dewi hold the three) |
| **A duplicate booking for the same child and class** | Book *Fractions Made Easy* → tick **Alya** → Continue. Refused: she already has a seat. Untick her, tick **Bima**, and it goes through |
| **A payment failure** | Book any class → pay with `4000 0000 0000 0002`. Declined, order becomes `payment_failed`, and no child joins the roster. Nadia's history also already holds one (Weather and Seasons, for Bima) |

Payment is mocked and **the outcome comes from the card number, decided by the
server** — there is no success/failure switch in the UI. Test cards:

| Card | Result |
|---|---|
| `4242 4242 4242 4242` | approved |
| `4000 0000 0000 0002` | declined — `card_declined` |
| `4000 0000 0000 9995` | declined — `insufficient_funds` |

The last-seat race is best watched in two browsers: sign in as Nadia and Rizky, both
take a class's last seat, pay in one. The second payment is refused and never
charged.

## Time spent

**4 hours 3 minutes**, measured between the first and last commit (both in this repo:
05:23 to 09:26, UTC+7).

## Assumptions

- **One node, one SQLite connection.** The serialisation argument below depends on
  it, and it is the first thing to revisit on a different deployment.
- **A hold holds no seat.** Soft holds are what make the race reachable, so capacity
  is enforced at payment rather than at selection.
- **One class per order** — the API books one class for N children, not a mixed
  basket.
- **Every seat in an order costs the same**, so `amount = price × children`.
- **SGD, and it never varies.** A class carries a price but no currency, so the UI
  shows an amount without a code rather than inventing one.
- **The cancellation cutoff is a duration** (5 days before the class), not calendar
  days.
- **Demo scale** — five classes, no pagination anywhere.
- **The browser's clock may be wrong without consequence**; the countdown uses it,
  the server never does.

## Key architecture and backend decisions

**A booking is an order with line items.** `Booking` holds the customer, the timer,
the total and the state; `BookingItem` is one child's line. An `Enrollment` is the
registration — "this child is in this class" — written when a line is paid and
deleted when refunded, behind a plain `UNIQUE(studentId, classId)`. This shape makes
all-or-nothing, one payment per order, and the group race consequences of the model
rather than rules to remember. `TrialClass.confirmedCount` is a denormalised counter,
not the truth; the roster is.

```
User ─1:1─ Parent
              ├─1:N─ Student
              │
              └─1:N─ Booking                    the order: customer, timer, total, status
                        │
                        ├─1:N─ BookingItem ──N:1── TrialClass
                        │          │
                        │          └─1:1─ Enrollment ──N:1──► TrialClass
                        │                the registration: "this child is in this class"
                        │
                        └─1:N─ Payment           charges and refunds for the order
```

Both the line and the registration point at `TrialClass`, and that is the design:
the line records what was **sold**, the registration records what the child is
**in**. One is a commercial fact about an order, the other is the roster — keeping
them separate is why "all the classes this child is registered for" is answerable
without going through bookings.

Not drawn, to keep it readable: `Student` is the other side of *both* `BookingItem`
and `Enrollment`, so a child holds their own lines and their own registrations.

**Four booking statuses.** `pending_payment` (held, no seat taken), `confirmed`
(paid, one enrollment per line), `payment_failed` (nothing registered), `cancelled`
(carrying a reason: `expired`, `seat_taken`, `duplicate_booking`,
`parent_cancelled`).

**How each invariant is held:**

- **No duplicate registration** — `UNIQUE(studentId, classId)` in the database, with
  no status predicate, because a refunded registration is deleted rather than
  flagged. Checked in the service too, before the seat count, so the parent is told
  *which* child.
- **Never oversold past 4** — a `CHECK (confirmedCount BETWEEN 0 AND capacity)`
  added by hand in a migration, plus a **conditional atomic update**
  (`SET confirmedCount = confirmedCount + n WHERE confirmedCount <= capacity - n`);
  zero rows changed means it did not fit and the transaction throws. A
  count-then-write would race. Everything runs on one synchronous SQLite connection,
  so two payments are serialised by construction.
- **The race resolves to one winner** — the seats are claimed only at payment, inside
  one transaction, by a conditional status transition
  (`WHERE id = ? AND status = 'pending_payment'`). Whoever wins that write takes the
  seats; the loser's zero-row update is the signal.
- **A failed payment never joins the roster** — the charge is decided **before** the
  seat guard, so the last-seat loser is never charged and there is no refund to
  issue. A declined card writes a failed `Payment` row.
- **Lapsed holds retire themselves** — no background job. Expiry is lazy: any
  operation touching a booking first retires lapsed ones, idempotently.
  `npm run sweep` does the same on a schedule.
- **Money** is a decimal at 2 dp, sent as a JSON number. **Time** is UTC everywhere,
  with durations in milliseconds rather than calendar arithmetic.

**Where each check lives** — the UI never decides anything:

| Check | Where |
|---|---|
| Request shape, email format, password length, Luhn on the card | API (zod) |
| "This child is yours and not removed" | API (needs the session) |
| "Already registered in this class" | Database `UNIQUE`, re-checked in the payment transaction |
| "Never more than 4 confirmed" | Database `CHECK` + the conditional update |
| "Only one of two racing payments wins" | Database (the conditional claim) |
| "Enough seats for this order", before payment | API — a fast refusal; payment stays authoritative |
| Whether the card succeeds | API (mock gateway, from the number) |
| "Is paying still on offer?" | UI displays, API decides — the UI may only *withhold* the button |
| Cancellation window | API |
| Retiring lapsed holds | The sweep |

The UI computes exactly one time-based thing, the hold countdown, and it is the same
comparison the server makes against the server's own `expiresAt`, read from one
shared clock so the countdown and the offer to pay cannot disagree. It can hide the
pay button early; it can never confirm, cancel or release anything.

**Two deployables.** The API never serves the SPA — they meet only at the Vite dev
proxy, which keeps every request same-origin. That is why there is no CORS
middleware and the cookie is `SameSite=Lax`; serving them from different origins
would break both, and would need a reverse proxy or CORS-with-credentials.

## What I deliberately cut

- **Real payments.** Mock only — no provider, no webhooks, no idempotency keys, no
  refund/abuse policy.
- **Complex login and registration.** No email verification, no password reset, no
  refresh-token rotation.
- **Proper security hardening.** No CORS setup, no rate limiting, no CSRF tokens.
  `SameSite=Lax` is the only CSRF protection, which is enough for a same-origin demo
  and not for a real deployment.
- **Admin CRUD.** No creating or editing anything — classes, children and rosters are
  seeded or read-only from the admin side.
- **Class management.** No updating a class, no adding details to one, no teacher
  assignment, no closing enrolment.
- **Caching**, at any layer.
- **Logging.** No logger library and no request logging — the only output is
  `console.error` for an unhandled error (`api/src/app.ts`), plus the startup and
  CLI lines. No levels, no request ids, and nothing that ties the calls touching one
  booking together, which is exactly what you want when a race has to be
  reconstructed after the fact. The app's own errors are mapped to the right status
  and returned in the envelope, so nothing is *lost* — it just is not recorded.
- **Observability** beyond that: no metrics, no tracing, no health endpoint.
- Also out of scope: background/scheduled expiry (lazy + sweep instead), baskets
  across multiple classes, partial cancellation of one child out of an order,
  pagination, a component library, animations, end-to-end browser tests in CI, and
  deployment manifests.

## What I would monitor after release

1. **The counter invariant** — `SUM(confirmedCount)` against `COUNT(enrollments)` per
   class. They must be equal; any drift is a correctness bug, and it is the cheapest
   thing to alarm on. Likewise every `CHECK` and `UNIQUE` violation: those should be
   unreachable, so each one is a defect rather than noise.
2. **`SEAT_TAKEN` rate** — the direct measure of the race being lost in the wild. A
   rise means contention went up or the hold timer is too short.
3. **The payment funnel** — holds created → paid → confirmed, and the drop at each
   step by failure code. `BOOKING_EXPIRED` at pay means people are being given less
   time than they need.
4. **Sweep health** — alert on it *not running*, not merely on it erroring. It is the
   only thing releasing holds for parents who never come back, and its absence shows
   up as "classes look full but the roster is empty".
5. **Refund and cancellation rates**, and how close to the cutoff they happen, to see
   whether 5 days is where parents actually want it.
6. **Latency of `GET /api/classes`** — it counts live holds per class, so it is the
   read most likely to degrade first.
7. **5xx and 401/403 rates by route.** A `FORBIDDEN` spike usually means the frontend
   is asking for something the session cannot do.

Most of the above needs something this build does not have: **structured request
logs with a request id**, so one booking can be followed across the calls that
touched it. Until that exists, a race can only be inferred from counters rather
than read from a log — which is why it is the first item under "next" below.

## What I would do next with more time

1. **Structured logging**, with a request id threaded through the booking
   transaction. Every question in the section above is easier to answer with it, and
   reconstructing a lost race without it means inferring from counters. It is the
   cheapest of these to add and the one that makes the rest observable.
2. **A background expiry job**, so expiry does not depend on someone visiting —
   `sweep` already exists to be its body.
3. **A real payment integration** with webhook reconciliation, which changes the
   confirm path from one transaction into something that must tolerate arriving
   twice.
4. **A Playwright test of the race in two browser contexts.** The invariant is proved
   at the API level today; this would prove the *experience* of losing, which is what
   a human is asked to judge.
5. **Show a child's enrolled classes in the UI.** `GET /api/students/:id/enrollments`
   exists and nothing consumes it.
6. **Partial cancellation** — pull one child out of a multi-child order. The model
   supports it; the order's all-or-nothing state is what blocks it.
7. **Class management** — create and edit classes, assign a teacher.
8. **A generated API client** from the OpenAPI document, replacing the hand-kept
   types in `web/src/lib/types.ts`.
9. **Auth and security hardening** — verification, reset, rate limiting, CSRF.
10. **Deployment** — a container each behind a reverse proxy, which is also what
    resolves the cookie/CORS constraint.

See `AI_USAGE.md` for how this was built with AI, where it was corrected, and how the
result was verified.
