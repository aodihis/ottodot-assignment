# Trial class booking

A parent books a trial class for one of their children, pays (mock), and sees the
booking status. An admin sees each class's roster. Trial classes cap at **4
confirmed students**.

The interesting parts are the invariants, not the screens: a duplicate confirmed
booking, an overbooked class, a payment that fails without putting the child on
the roster, and two parents racing for the last seat — where at most one of them
ends up confirmed, and the loser is told so and never charged.

## What I built

Two deployables and a test suite.

**`api/`** — Hono on Node, Prisma 7 over SQLite, zod at the boundary. 16 endpoints
across auth, children, classes, bookings and an admin roster view. 8 models.
Session auth with an httpOnly cookie. Every route declares its own OpenAPI
document, so a browsable reference is generated from the code rather than kept
beside it.

**`web/`** — a Svelte 5 SPA. The parent flow is four screens (class list, choose
children, pay, booking status) plus a login screen and an admin roster view. No
router library and no state library — the screens are named by the URL hash, which
is what makes Back and refresh work.

**Tests** — 214 of them: 157 against the API (unit and integration, on a real
SQLite database rebuilt from the migrations on every run) and 57 against the SPA.
Plus the invariants checked twice over: the database enforces them, and the suite
proves the enforcement actually bites.

The parts I would point a reviewer at first are `api/src/modules/bookings/bookings.service.ts`
(where the race is decided) and `api/tests/integration/bookings.test.ts` (where it
is proved).

## How to run it

### Requirements

- **Node 20.19+** (or 22.12+). Vite 8 requires it; Node 20.0–20.18 will fail on
  `npm install`.
- npm 10+. No database to install — SQLite is a file.

### Setup

```bash
npm install

# The API refuses to start without a session secret, so both .env files are needed.
cp api/.env.example api/.env
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
#   ... paste the output into SESSION_SECRET in api/.env
cp web/.env.example web/.env

npm run reset     # create the database, apply migrations, load the demo data
npm run dev       # the API on :3000 and the app on :4173
```

Then open **http://localhost:4173**.

`npm run reset` drops and rebuilds the database, so it is also how you get back to
a clean demo after clicking around. Stop `npm run dev` first: a running server
holds the database file open, and Prisma will refuse with `database is locked`.

Both ports come from those `.env` files, so change them there if they clash with
something you already run.

## Accounts

Every seeded account uses the password **`password123`**. The login screen lists
them, so you can click one instead of typing (it fills the form but does not
submit).

| Email | Name | Role | Children |
|---|---|---|---|
| `parent1@demo.test` | Nadia | parent | Alya, Bima |
| `parent2@demo.test` | Rizky | parent | Citra |
| `parent3@demo.test` | Sari | parent | Dewi, Eka |
| `admin@demo.test` | Ms. Tan | admin | — (sees the rosters) |

Registration is open, so you can also create your own account — but the four
addresses above are taken, and registering one answers `EMAIL_TAKEN`.

## Test cards

Payment is mocked, and **the outcome is derived from the card number by the
server** — there is no success/failure switch in the UI to flip. The app shows
these three cards so you don't have to remember them.

| Card number | Result |
|---|---|
| `4242 4242 4242 4242` | approved |
| `4000 0000 0000 0002` | declined (`card_declined`) |
| `4000 0000 0000 9995` | declined (`insufficient_funds`) |

Any other Luhn-valid number is approved. Only the last four digits are ever stored
or returned.

## The four seeded cases

`npm run seed` guarantees these four are reachable, and **fails loudly if it ever
stops producing one** — a seed that quietly drops a case is worse than no seed,
because this table would still claim it. The check lives in
`api/src/helpers/demoScenarios.ts`; the seed prints what it found.

Sign in as **Nadia** (`parent1@demo.test`) for all four.

### 1. A class with seats available

**Steps:** none — look at the list. *Plants and How They Grow* and *Weather and
Seasons* read **4 of 4 left**, *Shapes Around Us* **3 of 4**.

Click any title (or its **Book**) and the picker opens on its own screen.

### 2. A class with exactly 3 confirmed students

**Steps:** none — *Fractions Made Easy* reads **1 of 4 left**. Its three seats
belong to Alya, Citra and Dewi, so exactly one is free.

Keep this screen open; case 3 happens on it.

### 3. A duplicate booking for the same child and class

Alya already holds one of those three Fractions seats.

**Steps:** click **Book** on *Fractions Made Easy* → tick **Alya** → **Continue to
payment**. It is refused with "Already booked or held", and nothing is written.
Untick Alya, tick **Bima**, and the same screen continues instead.

The refusal is checked before the seat count, so this is what you get rather than
"not enough seats" — the child is the problem, not the capacity.

### 4. A payment failure

Two ways, and both are worth seeing because they differ.

**Cause one — pay with a declining card.** Click **Book** on *Plants and How They
Grow* → tick **both** children → **Continue to payment** → pay with
`4000 0000 0000 0002`. The card is declined, the order becomes `payment_failed`,
and **neither** child joins the roster. Book again and it works.

**Cause two — one already in the history.** Open the `payment_failed` booking in
**Your bookings** (Weather and Seasons, for Bima). It shows the failed charge, the
card's last four, and the reason — `card_declined`.

## A five-minute walkthrough

The parent flow is four screens, each with one job: the class list, choosing
children, paying, and a booking's own status. They are hash routes
(`#/book/<classId>`, `#/pay/<bookingId>`, `#/booking/<bookingId>`), so the
browser's Back button moves between them and a booking page survives a refresh.

The seeded classes are set up so the interesting cases are one click away. Who
already holds a seat matters as much as the counts:

| Class | Seats | Seeded state |
|---|---|---|
| **Fractions Made Easy** | 3 of 4 | Alya, Citra and Dewi already have seats — **one left**, and for Nadia that seat is **Bima's** |
| **Simple Machines** | 4 of 4 | **Full** (Bima, Citra, Dewi, Eka) |
| **Shapes Around Us** | 1 of 4 | Alya has a seat; this one starts soonest |
| **Plants and How They Grow** | 0 of 4 | empty |
| **Weather and Seasons** | 0 of 4 | empty |

Sign in as **Nadia** (`parent1@demo.test`) — she has Alya and Bima.

1. **Fractions Made Easy** reads "1 of 4 left" and links to its own booking
   screen. Try it for **Alya**: refused, because she already has a seat there. A
   child cannot be registered in the same class twice.
2. Pick **Bima** instead and continue. You land on the payment screen with a
   **15-minute countdown** and the order — nothing charged, and no seat taken yet.
3. Pay with `4242 4242 4242 4242`. You land on the booking's own page, now
   **Confirmed**, and the class falls to **0 of 4 left**.
4. Back on the list, **Simple Machines** is full. Try it for **Alya** (the one
   child of Nadia's without a seat there): refused with "Not enough seats" before
   any payment is attempted.
5. On **Plants and How They Grow**, select **both** children and pay with
   `4000 0000 0000 0002`. The card is declined, the booking goes to
   `payment_failed`, and **neither** child is on the roster. Book again and it works.
6. Open the confirmed Fractions booking from **Your bookings** and cancel it. It is
   refunded in full, Bima comes off the roster, and the seat goes back — "1 of 4
   left" again.
7. Sign out, and in as **Ms. Tan** (`admin@demo.test`) to see each class's roster,
   the selections still in progress, and the refunds.

Both refusals in steps 1 and 4 are the same shape: nothing is written, and the
message says which children were involved.

To watch the **last-seat race**, open two browsers (or one normal and one private
window), sign in as Nadia and Rizky, have both select the last seat of a class,
and pay in one of them first. The second payment is refused and never charged, and
the loser is told the seats went.

> The *two children, one seat* refusal — an order that cannot fit is refused whole
> rather than partly taken — is pinned by the test suite rather than the demo data,
> because no seeded class has one seat and two free children for the same parent.

## How it works

### The data model

Eight models, and one decision runs through all of them: **a booking is an order.**

```
User ── Parent ── Student
                    │
TrialClass ─────────┼── BookingItem ── Booking        (BookingItem: what was
     │              │        │                         bought for one child)
     └── Enrollment ┘        └── Payment               (one charge per order)
```

- **`Booking`** is the order: the customer, one timer, one total, one state. It has
  no per-child state, because an order is all-or-nothing.
- **`BookingItem`** is a line: what was bought for one child and what it cost. Not
  the state holder — the order is.
- **`Enrollment`** is the registration: "this child is in this class". Written when
  a line is paid, deleted when it is refunded, with a plain
  `UNIQUE(studentId, classId)` behind it.
- **`TrialClass.confirmedCount`** is a denormalised counter. It is *not* the truth —
  the roster is. It exists so the capacity check is one atomic statement instead of
  a count-then-write, and the invariant between them (`confirmedCount ==
  COUNT(enrollments)`) is asserted after every mutating test.
- **`Payment`** holds charges and refunds, with a masked card (`{brand, last4}`)
  and never a PAN.

This shape came from a correction, and it earned its keep: "one order, N children,
one payment" then made all-or-nothing, the group race, and the refund arithmetic
fall out of the model instead of being rules I had to remember.

### Booking statuses

`Booking.status` is one of four, and each is a real state rather than a label:

| Status | Means |
|---|---|
| `pending_payment` | Seats are **held**, not taken. A hold consumes no seat. |
| `confirmed` | Paid. One `Enrollment` per line, `confirmedCount` moved. |
| `payment_failed` | The charge was refused. Nothing registered, nothing owed. |
| `cancelled` | Retired, with a `cancelledReason`: `expired`, `seat_taken`, `duplicate_booking`, or `parent_cancelled`. |

The reason matters: `seat_taken` and `duplicate_booking` are losses the parent
must be told about, and `expired` is nobody's fault.

### How each invariant is held

**A child cannot hold two seats in one class.** The database enforces it —
`UNIQUE(studentId, classId)` on `Enrollment`, with no status predicate, because a
refunded registration is *deleted* rather than flagged. The friendly check happens
too, before the seat count, so the parent is told which child is the problem.

**A class is never oversold past 4.** Three layers, and the middle one is the real
guard:

1. A `CHECK (confirmedCount BETWEEN 0 AND capacity)` on `TrialClass`, hand-added in
   a migration because Prisma cannot express it.
2. A **conditional atomic `UPDATE`**: `SET confirmedCount = confirmedCount + n
   WHERE confirmedCount <= capacity - n`. Zero rows updated means it did not fit,
   and the transaction throws. A count-then-write would race; this cannot.
3. Everything runs on **one synchronous SQLite connection** (the better-sqlite3
   driver adapter), so two "simultaneous" payments are serialised by construction
   rather than by a lock I had to add. That property is load-bearing — the design is
   correct for a single connection, and it is written down here because it is the
   assumption a move to Postgres would invalidate.

**The last-seat race resolves to exactly one winner.** A hold never takes a seat —
that is the whole point, because if it did, the second parent could never reach the
last seat and the race the assignment asks about would be unreachable. So
availability is `capacity − confirmedCount`, and the seat is claimed only at
payment, inside one transaction: re-read the class, re-check the child, then claim
the order with a **conditional status transition**
(`WHERE id = ? AND status = 'pending_payment'`). Whichever payment wins that write
takes the seats; the loser's zero-row update is the signal.

**A failed payment never joins the roster.** Nothing is registered unless the
charge succeeds, and the charge is decided *before* the seat guard. That ordering
is deliberate: it means the last-seat loser is **never charged in the first place**,
so there is no refund to issue and no window where money is owed to someone who got
nothing. A declined card writes a failed `Payment` row and moves the order to
`payment_failed`.

**Cancelling refunds and releases.** A confirmed booking can be cancelled up to the
cutoff (5 days before the class, by default). That writes a `refund` payment,
decrements `confirmedCount`, deletes the `Enrollment`s, and records the refund on
each line — in one transaction, with the same conditional claim, so two cancels
cannot both refund.

**Lapsed holds retire themselves.** There is no background job. Expiry is *lazy*:
any operation that touches a booking first retires the ones whose hold lapsed or
whose class has started, idempotently. `npm run sweep` exists to do the same on a
schedule for holds nobody comes back to, and is safe to re-run.

**Money is a decimal, not cents.** `Decimal` at 2 decimal places, exposed as a JSON
number (`50`, `100`, `37.5`). Sums are done in decimal, never in floats.

**Time is UTC everywhere.** One `utcNow()`, durations in milliseconds, and every
timestamp is returned as ISO-8601 with a `Z`. No calendar-date arithmetic, so no
DST edge cases.

**The API document cannot drift.** Every route declares its own path, body and
responses with `@hono/zod-openapi`, and `docs.test.ts` fails if a mounted route is
missing from the generated document. Declaring responses also makes the compiler
check them: a handler whose return stops matching its documented response fails
`npm run typecheck`.

### Where each check lives

The assignment asks which checks belong where. The short version: **the UI never
decides anything.**

| Check | Lives in | Why there |
|---|---|---|
| Shape of a request, email format, password length, Luhn on the card | **API** (zod) | the only boundary a client cannot bypass |
| "This child is yours and not removed" | **API** | needs the session; the client cannot be trusted to know it |
| "Already registered in this class" | **Database** (`UNIQUE`) + API re-check inside the payment transaction | the constraint is the guarantee; the check exists to say *which* child |
| "Never more than 4 confirmed" | **Database** (`CHECK`) + the conditional `UPDATE` | a count-then-write races; one statement cannot |
| "Only one of two racing payments wins" | **Database** (the conditional status claim, serialised by the single connection) | same reason — this is the race, so it cannot be application logic |
| "Enough seats for this order" before payment | **API**, with a friendly early refusal | fast feedback; payment is still authoritative |
| Whether the card succeeds | **API** (mock gateway, from the number) | the client must not be able to choose the outcome |
| "Is paying still on offer?" | **UI** displays, **API** decides | the UI may only *withhold* an affordance; `POST /pay` is the arbiter |
| Cancellation window | **API** | a business rule, not a display concern |
| Retiring lapsed holds | **The sweep** (`npm run sweep`, cron-able) | so expiry does not depend on somebody visiting a page |

The UI does compute one time-based thing — the hold countdown — and it is
deliberately the same comparison the server makes (`expiresAt <= now`) against the
server's own `expiresAt`, read from one shared clock so the countdown and the offer
to pay cannot disagree. It can only ever hide the pay button early. It can never
confirm, cancel, or release anything, and pressing Pay a second too late comes back
as a `409 BOOKING_EXPIRED`.

### Two deployables

The API is a pure API and never serves the SPA. They meet only at the Vite dev
proxy, which is what keeps every request same-origin — and same-origin is what lets
the session cookie work with **no CORS middleware at all**.

That is a real constraint, not an accident: the cookie is `SameSite=Lax`, so
serving the SPA from a different origin would break both the cookie and CORS at
once. The fix is a reverse proxy in front (the browser still sees one origin) or
CORS-with-credentials plus `SameSite=None; Secure`.

## Assumptions

- **One node, one SQLite connection.** The serialisation argument above depends on
  it. This is the assumption to revisit first if the deployment changes.
- **A hold holds nothing.** Soft holds are what make the race reachable, so the
  capacity guarantee is enforced at payment rather than at selection.
- **One class per order.** The API books one class for N children, not a basket of
  mixed classes. A real cart would need the seat check per class.
- **Every seat in an order costs the same.** `Booking.amount` is `price × children`.
- **SGD, and it never varies.** `TrialClass` carries a price but no currency, so the
  class list shows an amount without a currency code rather than inventing one.
- **The cancellation cutoff is a duration**, not calendar days — a deliberate
  simplification; Phase 2's notes record it.
- **Auth is demo-grade.** No email verification, no password reset, no rate
  limiting, no CSRF token. `SameSite=Lax` is the only CSRF protection, which is
  adequate for a same-origin demo and not for a real one.
- **A clock can be wrong without consequence.** The countdown trusts the browser's
  clock, and the server never does.
- **Demo scale.** Five classes, four accounts, no pagination anywhere.

## Key decisions, and what I deliberately cut

These are the decisions a reviewer would want the reasoning for. Everything else
in the plans at `.claude/plan/` is the fuller record, including what was rejected.

**Kept:**

- **Order + line items** rather than a per-child booking. See above — this is the
  decision that did the most work.
- **Soft holds.** The obvious alternative is a hard hold that reserves a seat, and
  it makes the assignment's race un-demonstrable: if the first parent's seat is
  held, the second never gets near the last one. Soft holds keep the race real and
  push the guarantee to one atomic statement at payment.
- **Pre-authorisation before the seat guard.** Means the loser is never charged, so
  there is no refund path for a service that was not delivered.
- **Lazy expiry instead of a job.** One fewer moving part, and the sweep covers the
  scheduled case. The cost is that a lapsed hold is retired by whoever reads next.
- **Routes declare themselves** (`@hono/zod-openapi`) instead of a hand-written
  `openapi.yaml`, so the reference cannot drift and the compiler checks responses.
- **No router or state library in the SPA.** Four screens and one store did not
  justify either; the hash is genuinely enough state.

**Cut, deliberately:**

- **Real payments.** No provider, no webhooks, no idempotency keys, no refund
  abuse handling. A real one would need all four, and the mock gateway is where the
  boundary would go.
- **Anything that depends on a scheduler.** No background expiry, no reminders, no
  "your class starts tomorrow" email. `npm run sweep` is the seam.
- **Class management.** Classes are seeded, not created — no admin CRUD, no teacher
  assignment. Out of scope for the brief.
- **Baskets.** One class per order, as above.
- **Partial cancellation.** Cancelling an order cancels every line, because the
  order is all-or-nothing. A parent who wants one child out cancels and rebooks.
- **Auth hardening.** Email verification, password reset, rate limiting, CSRF
  tokens, refresh-token rotation. The session cookie is httpOnly, signed HS256, and
  expires in 7 days, and that is the extent of it.
- **Scale work.** No pagination, no caching, no read replicas, no job queue.
- **Polish and process.** No component library, no animations, no accessibility
  audit beyond a visible focus ring and reduced-motion support. No CI, no Docker,
  no deployment manifests — the two `.env.example` files are the only deployment
  documentation I wrote.
- **End-to-end browser tests.** The race is proved at the API level, where the
  invariant lives, rather than through two browser windows.
- **The video walkthrough.** Mine to record separately.

## What I would monitor after release

Ordered by what would hurt first.

1. **The counter invariant, continuously.** `SUM(confirmedCount)` against
   `COUNT(enrollments)` per class. They must be equal; the roster is the truth and
   the counter is a cache. Any drift is a correctness bug, and it is the cheapest
   signal to alarm on. Related: any `CHECK` or `UNIQUE` constraint violation at all —
   those should be unreachable, so each occurrence is a defect, not noise.
2. **Overbooking reports.** A user-visible "it let me book and then refused me"
   rate. The `SEAT_TAKEN` count is the direct proxy, and a rise in it means either
   contention went up or the hold timer is too short.
3. **The payment funnel.** Holds created → paid → confirmed, and the drop at each
   step, split by failure code. `BOOKING_EXPIRED` on pay means people are being
   given less time than they need; `CARD_DECLINED` is expected and should be flat.
4. **Sweep health.** It is the only thing retiring holds for parents who never come
   back. If it stops, seats stay out of circulation and the symptom appears as
   "classes look full but the roster is empty" — so alert on the sweep *not*
   running, not merely on it erroring.
5. **Refund rate and cancellations inside the cutoff window**, to see whether the
   cutoff is set where parents actually want it.
6. **Latency of `GET /api/classes`**, which counts live holds per class; it is the
   read most likely to degrade first as holds pile up.
7. **5xx and 401/403 rates** by route — a spike in `FORBIDDEN` usually means a
   frontend change is asking for something the session cannot do.

On a real deployment I would want structured request logs with a request id
threaded through the booking transaction, so a race can be reconstructed from logs
rather than inferred from counts.

## What I would do next with more time

In the order I would actually do them:

1. **A background expiry job.** Lazy expiry is correct but makes the read path do
   writes; a real scheduler would retire holds on time regardless of traffic, and
   `sweep` already exists to be its body.
2. **A real payment integration**, with webhook reconciliation and an idempotency
   key per attempt. The mock's seam — a card number deciding an outcome — is
   deliberately fake, and a webhook is genuinely asynchronous, which changes the
   confirm path from one transaction into something that must tolerate arriving
   twice.
3. **Make the race visible in the browser** with a Playwright test that drives two
   contexts at the last seat. The invariant is proved at the API level today; this
   would prove the *experience* of losing, which is what the assignment actually
   asks a human to judge.
4. **Finish the enrolment story in the UI.** `GET /api/students/:id/enrollments`
   exists and nothing consumes it — a parent cannot currently see "which classes is
   Alya registered for?" without reading her bookings.
5. **Partial cancellation**, so a parent can pull one child out of a multi-child
   order. The model already supports it (`Enrollment` per child); only the order's
   all-or-nothing state blocks it, and that state is load-bearing, so this is a
   design job rather than a feature.
6. **Class management** — create and edit classes, assign a teacher, close one for
   enrolment.
7. **A generated client for the SPA** from the OpenAPI document, replacing
   `web/src/lib/types.ts`. The document is already generated from the routes and
   already checked against them; hand-keeping the types is the last place drift can
   hide.
8. **Auth hardening** — verification, reset, rate limiting, CSRF tokens, and a
   shorter session with rotation.
9. **Deployment**: a container per deployable behind a reverse proxy, which is also
   what resolves the cookie/CORS constraint above.

## Time spent

**Just under four hours** of wall-clock time, start to finish: the first commit is
at **05:23** and the last at **09:23** (UTC+7), so roughly **4 hours**, including
planning, implementation, tests and this write-up.

Measured as the span between the first and last commit, so it counts everything
worked in between but cannot separate reading and thinking from typing. It covers
all five phases:

| Phase | What |
|---|---|
| 1 | Auth, children, class reads, the schema and the first migrations |
| 2 | Booking orders, soft holds, mock payment, enrolments, cancel/refund |
| 3 | The Svelte SPA, and the parent booking list endpoint |
| 4 | This write-up |
| 5 | The OpenAPI document and the browsable reference |

The single biggest cost was not any one feature but the ordering question — which
check belongs in the database versus the service versus the client. Getting that
wrong in Phase 1 showed up as rework in Phase 2, which is why the table above is
in the README rather than left implicit.

## Commands

| | |
|---|---|
| `npm run dev` | API on :3000 and the app on :4173 |
| `npm run dev:api` / `npm run dev:web` | either half on its own |
| `npm test` | both suites: the API, then the web |
| `npm test -- tests/integration/auth.test.ts` | one API test file (relative to `api/`) |
| `npm run typecheck` | `tsc --noEmit` for the API, `svelte-check` for the web |
| `npm run build` | build the app into `web/dist` |
| `npm run reset` | drop, migrate, and reseed the database |
| `npm run seed` | reseed without dropping |
| `npm run sweep` | retire lapsed seat selections (safe to re-run; cron-able) |
| `npm run migrate -- --name <name>` | create and apply a migration |

While `npm run dev` is running, **http://localhost:3000/scalar** is a browsable
reference for the whole API. It is only served for `development` and `test`.

## Layout

```
api/            Hono + Prisma 7 + SQLite. Modules: auth, students, classes, bookings.
  src/modules/<module>/<module>.routes.ts   HTTP only — parse, call, respond
  src/modules/<module>/<module>.service.ts  the logic
  src/helpers/                              hashing, money, datetimes, seats, config
  prisma/schema.prisma                      the data model
  prisma/migrations/                        hand-reviewed SQL, including the CHECK
  prisma/seed.ts                            the demo data, and its own guard
  tests/{unit,integration}                  Vitest, against a real SQLite database
web/            Svelte 5 + Vite SPA. No router library, no state library.
  src/lib/api.ts                            the only place that knows the envelope
  src/lib/errors.ts                         error code -> what to say and offer
  src/lib/route.svelte.ts                   the parent flow's screens, named by the hash
  src/lib/*.svelte.ts                       the stores (session, classes, bookings, clock)
  src/views/                                Login, ParentHome (the shell) and its
                                            screens: ClassesPage, BookPage, PayPage,
                                            BookingPage; plus AdminHome
  src/components/                           the pieces those screens are made of
  tests/{unit,integration}                  Vitest + jsdom
.claude/plan/   the phase plans — decisions, risks, and what was rejected
```

## Configuration

`api/.env` and `web/.env` (both gitignored; `.env.example` in each documents every
key). The ones worth knowing:

| Key | Where | Meaning |
|---|---|---|
| `SESSION_SECRET` | `api/.env` | signs the session cookie; the API refuses to boot without it |
| `PORT` | `api/.env` | the API's port (default 3000) |
| `NODE_ENV` | `api/.env` | `/scalar` and `/doc` are served only for `development` and `test` |
| `BOOKING_HOLD_MINUTES` | `api/.env` | how long a selection is held (default 15 — set it to 1 to watch the timer) |
| `CANCELLATION_CUTOFF_DAYS` | `api/.env` | how close to the class start cancelling stops being allowed (default 5) |
| `WEB_PORT` | `web/.env` | the port the app is served on (4173) |
| `API_TARGET` | `web/.env` | where the dev proxy forwards `/api` |
| `VITE_API_BASE` | `web/.env` | the path the browser calls (`/api`) |

See `AI_USAGE.md` for how this was built with AI, where it was corrected, and how
the result was verified.
