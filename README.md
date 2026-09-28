# Trial class booking

A parent books a trial class for one of their children, pays (mock), and sees the
booking status. An admin sees each class's roster. Trial classes cap at **4
confirmed students**.

The interesting parts are the invariants, not the screens: a duplicate confirmed
booking, an overbooked class, a payment that fails without putting the child on
the roster, and two parents racing for the last seat — where at most one of them
ends up confirmed, and the loser is told so and never charged.

## Requirements

- **Node 20.19+** (or 22.12+). Vite 8 requires it; Node 20.0–20.18 will fail on
  `npm install`.
- npm 10+. No database to install — SQLite is a file.

## Getting started

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
  prisma/seed.ts                            the demo data above
  tests/{unit,integration}                  Vitest, against a real SQLite database
web/            Svelte 5 + Vite SPA. No router library, no state library.
  src/lib/api.ts                            the only place that knows the envelope
  src/lib/errors.ts                         error code -> what to say and offer
  src/lib/route.svelte.ts                   the parent flow's screens, named by the URL hash
  src/lib/*.svelte.ts                       the stores (session, classes, bookings, clock)
  src/views/                                Login, ParentHome (the shell) and its
                                            screens: ClassesPage, BookPage, PayPage,
                                            BookingPage; plus AdminHome
  src/components/                           the pieces those screens are made of
  tests/{unit,integration}                  Vitest + jsdom
```

The API and the app are separate: in production they ship as separate containers,
and the API never serves the SPA. They are joined in development by the Vite proxy,
which is what keeps the session cookie same-origin with no CORS.

## Configuration

`api/.env` and `web/.env` (both gitignored; `.env.example` in each documents every
key). The ones worth knowing:

| Key | Where | Meaning |
|---|---|---|
| `SESSION_SECRET` | `api/.env` | signs the session cookie; the API refuses to boot without it |
| `PORT` | `api/.env` | the API's port (default 3000) |
| `BOOKING_HOLD_MINUTES` | `api/.env` | how long a selection is held (default 15 — set it to 1 to watch the timer) |
| `CANCELLATION_CUTOFF_DAYS` | `api/.env` | how close to the class start cancelling stops being allowed (default 5) |
| `WEB_PORT` | `web/.env` | the port the app is served on (4173) |
| `API_TARGET` | `web/.env` | where the dev proxy forwards `/api` |
| `VITE_API_BASE` | `web/.env` | the path the browser calls (`/api`) |

Both ports in this README come from those files — change them there if they clash
with something you already run.

## Status

Setup, the API, the app, and the tests are done; the suite covers the invariants
above, including the last-seat race. The design write-up — the approach, the
tradeoffs, and where each check belongs — is the next piece of work.
