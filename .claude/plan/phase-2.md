# Plan — Phase 2: bookings (order + line items), mock payment, and the hold timer

Status: done (2026-09-28)
Iteration: 2

<shared-context>
<!-- Restated in every plan file so context survives across phases. -->

## Assignment (source of truth)

Build the smallest working slice of a **trial-class booking** system. A parent picks a child and an available trial class, submits a booking, passes a mock payment step, and sees the booking status. An admin/teacher can see the class roster. Trial classes cap at **4 confirmed** students.

Must prevent or handle: duplicate confirmed bookings for the same child+class, overbooking past 4, payment failure that must NOT add the child to the confirmed roster, and the required **last-seat race** (A and B grab the last seat; B pays first; only one booking may end up confirmed).

Regular enrollment is out of scope. Deliverables: public GitHub repo with README.md (approach, tradeoffs, data model, endpoints, statuses, which checks live in UI/backend/DB/job), implementation, seed data, tests, AI_USAGE.md, plus a short video walkthrough.

## User stories

| # | Story | Status |
|---|-------|--------|
| 1 | As a developer/reviewer, I can reset+seed demo data in one command, so the demo runs in minutes | done (Phase 1) |
| 2 | As a parent or admin, I can log in (seeded account or my own registration), so the API is session-gated | done (Phase 1) |
| 3 | As a parent, I can see my children and trial classes with seats remaining | done (API; UI in Phase 3) |
| 4 | As a parent, I can book a trial class for my child and see the booking status after submission | **done** |
| 5 | As a parent, I can mock-pay; on failure my child is not on the roster and I can retry | **done** |
| 6 | As a parent competing for the last seat, only the first successful payment confirms; the loser is clearly told and not charged | **done** |
| 7 | As an admin, I can list classes and view each class's confirmed roster | done (API; UI in Phase 3) |
| 8 | As a reviewer, I can run a test suite proving all invariants | done (128 tests; presented in Phase 4) |
| 9 | As a visitor, I can register with my email and password, so I can use the app without a seeded account | done (Phase 1) |
| 10 | As a parent, I can add and remove my own children | done (Phase 1) |
| 11 | As a parent, I can cancel a confirmed booking before the cancellation cutoff and receive a mock refund | **done** |
| 12 | As a parent, my selection is held for a limited time, and released back to the class when it lapses | **done** |

## Stack (concluded 2026-09-28)

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript (Node 20+) | one language across API/web/tests |
| API | Hono + @hono/node-server | lightweight; `app.request()` enables tests without a listening server |
| ORM/DB | Prisma 7 + SQLite through the better-sqlite3 driver adapter | schema-first typed models, zero-infra DB; one synchronous connection |
| Validation | zod | boundary validation; closed vocabularies are Prisma enums |
| Auth | hono/jwt signed httpOnly cookie + hash-wasm argon2id | session-gated API; no native binaries |
| Frontend | Svelte 5 + Vite SPA | SPA (no SSR) |
| Tests | Vitest | runs against a real, separate test database |
| Tooling | tsx, npm workspaces, concurrently | monorepo: `api/` (with its own tests), `web/` |

## Decisions so far

- 2026-09-28 — Soft holds: a `pending_payment` booking never consumes a seat; availability = `capacity − confirmedCount`.
- 2026-09-28 — Serialization is structural: the better-sqlite3 adapter is one synchronous connection, so check-then-act guards are safe without a `connection_limit` parameter.
- 2026-09-28 — **A booking is an order, and its children are line items** (`Booking` + `BookingItem`). The user's correction: "don't make the name booking group just booking for endpoint, it easier for user to understand" — plain commerce vocabulary over invented compounds.
- 2026-09-28 — **Soft holds re-confirmed, deliberately, after being challenged.** The user asked whether a selection should reserve a seat (the KAI Access model) and whether the sweep should release seats. It should not, and the sweep must not: a reserved seat means the assignment's own scenario ("User B selects the same slot" while A is paying) becomes unreachable, and it adds a *release* path — the one place seat leaks live — without removing the race, because the same atomic guard is needed at whichever moment the seat is claimed. **Accepted cost:** two parents can hold the same seat and one learns only at payment; the API states it rather than hiding it (`pendingHolds` on the class, and a `409` carrying `requested` and `seatsAvailable` for a specific message).
- 2026-09-28 — **The booking row is the hold; there is no separate holds/reservations table.** A holds table only earns its keep for hard reservations (which would make the required race unreachable) or for numbered seats (classes have a capacity, not seat numbers).
- 2026-09-28 — **Seats are consumed at exactly one moment: confirm.** Nothing else touches `confirmedCount`.
- 2026-09-28 — **Pre-authorisation** (the phase-2 open question, closed): the mock card decision runs *before* the seat guard, so a parent who loses the last seat was never charged and no refund path exists for them; their failure is recorded as a failed charge.
- 2026-09-28 — **All-or-nothing per booking**, checked twice: a friendly `CLASS_FULL` at selection, and the authoritative re-check at payment ("we should check if total seat is equal or more than the children want to registered").
- 2026-09-28 — **The hold timer lives on the booking** (`expiresAt`, `BOOKING_HOLD_MINUTES`, default 15, read at call time). Release is a **CLI sweep** (`npm run sweep`) plus lazy expiry as the enforcement path.
- 2026-09-28 — **Money is a `Decimal` at 2 dp, exposed as a JSON number**: `price`, `amount`, `refundAmount` — never integer cents ("it is easier for debugging later... limit it to two decimal points"). JSON drops trailing zeros, which is accepted.
- 2026-09-28 — **Every timestamp is UTC.** Prisma stores SQLite `DateTime` as ISO-8601 **TEXT with an explicit offset** (verified in the database, and not the `NUMERIC` the docs' mapping table claims), and responses render `…Z`. `helpers/datetime.ts` holds the rule and the single `utcNow()` seam; the offset-rejecting `parseUtc` it first shipped with was deleted in the cleanup pass — nothing parses a caller-supplied timestamp, and the fix for an unshifted "now" is the helper, not a parser.
- 2026-09-28 — **One response envelope everywhere**: success `{message, ...namedKeys}`, failure `{message, error:{code, details?}}`, correct status codes (204s stay bodyless).
- 2026-09-28 — **Payment success is derived from the card number** (4242 succeeds; `…0002` declined, `…9995` insufficient funds; a Luhn failure is `422 INVALID_CARD` before any state change), so the API's success path is never self-reported.
- 2026-09-28 — Cards are stored masked only (`{brand, last4, holder}`); `maskCard` is the only function that sees a full number.
- 2026-09-28 — **The seat counter has one home** (`helpers/seats.ts`): `seatsAvailable` for reads, `registerChildren` for the one write path that moves the counter and the registrations together. Before, "capacity − confirmedCount" was spelled in four places with only one clamped, and the counter/enrollment pair was written by three hand-rolled copies (pay path, seed, fixtures).
- 2026-09-28 — **Cancellability is one function** (`helpers/bookings.ts`) returning `cancellable | window_closed | not_cancellable | class_started`; `bookingView` maps it to `canCancel`, `cancelBooking` maps it to its result. The rule used to exist twice in one file, kept in agreement by hand — the drift surface the plan already names as this codebase's bug class.
- 2026-09-28 — **`BookingItem.confirmedAt` is gone** (dropped by migration `20260928030000_seat_indexes`): three writers, no readers, and the instant already lives on `Booking.confirmedAt` and `Enrollment.enrolledAt`.
- 2026-09-28 — **A malformed body is `400 MALFORMED_JSON`**, not a 500: `c.req.json()` is a bare `JSON.parse`, so the `SyntaxError` is handled beside `ZodError` in `app.ts` — one branch for all five body-parsing endpoints.
- 2026-09-28 — **The class payload lives in `modules/classes/classes.view.ts`**, so the students module imports a view rather than reaching into a sibling module's service.
- 2026-09-28 — The roster's third list is keyed **`refunded`**, not `cancelled`: only a refunded cancellation leaves a row, and the old name promised a list it did not return.
</shared-context>

<phase-plan>
## Goal

A parent selects seats for one or more children, holds them for a limited time, pays once for the booking, and sees the status; a seat-loser is told clearly and never charged; an admin sees an honest roster; lapsed selections go back on the board.

## Contract (v2)

| Method | Path | Request | Success | Errors (status CODE) |
|---|---|---|---|---|
| POST | `/api/bookings` | `{classId, studentIds[]}` | 201 `{message, booking}` | 401 · 403 `NOT_YOUR_STUDENT` · 404 `CLASS_NOT_FOUND`/`STUDENT_NOT_FOUND` · 422 `VALIDATION_ERROR` · 409 `CLASS_FULL` `{requested, seatsAvailable}` · 409 `DUPLICATE_ACTIVE_BOOKING` `{studentIds}` · 409 `CLASS_ALREADY_STARTED` |
| GET | `/api/bookings/:id` | — | 200 `{message, booking}` | 401 · 403 · 404 `BOOKING_NOT_FOUND` |
| POST | `/api/bookings/:id/pay` | `{card:{number, holder?}}` | 200 `{message, booking, payment}` | 401 · 403 · 404 · 422 `VALIDATION_ERROR`/`INVALID_CARD` · 402 `CARD_DECLINED` · 409 `SEAT_TAKEN` `{requested, seatsAvailable, booking, payment}` · 409 `BOOKING_EXPIRED` · 409 `BOOKING_NOT_PAYABLE` · 409 `DUPLICATE_BOOKING` · 409 `CLASS_ALREADY_STARTED` |
| POST | `/api/bookings/:id/cancel` | — | 200 `{message, booking, refund}` (null when nothing was charged) | 401 · 403 · 404 · 409 `CANCELLATION_WINDOW_CLOSED` · 409 `BOOKING_NOT_CANCELLABLE` · 409 `CLASS_ALREADY_STARTED` |

Every earlier endpoint now carries the envelope too (see `phase-1.md` for the phase-1 routes).

## Selected vs booked

| Concept | Stored as | Consumes a seat? |
|---|---|---|
| Selected | a booking in `pending_payment` | No — visible as `class.pendingHolds` |
| Booked | an **`Enrollment`** row per child, plus `booking.status = confirmed` | Yes — `confirmedCount += n` at that instant |
| Released | booking `cancelled` + reason `expired` (sweep, or lazily) | No |
| Failed | booking `payment_failed` / `cancelled` + reason | No |

## Enrollments (added 2026-09-28, after the phase first landed)

The roster used to be derived from *confirmed booking-item rows* — a commercial fact about an order, filtered by a status predicate. The user's correction: a student should relate to a class directly, written when the booking completes, so "all the classes registered for this student" is answerable. So:

- **`Enrollment`** — `studentId`, `classId`, `bookingItemId` (unique provenance), `enrolledAt`, with relations from both `Student` and `TrialClass`, and a plain `UNIQUE(studentId, classId)`: at most one registration per child per class, with no status predicate, because a refunded registration is *deleted* rather than marked.
- **`BookingItem.status` is gone.** A booking is all-or-nothing, so the order carries the state; the line records what was bought and what it cost. Six item-status mirror writes disappeared from pay/cancel/sweep. The partial index `Booking_confirmed_unique` went with it — its guarantee lives on `Enrollment` now, which is strictly stronger (no predicate).
- **Newest endpoint**: `GET /api/students/:id/enrollments` → the classes a child is registered in, with `enrolledAt` per registration.
- **`TrialClass.description`** (nullable) added, seeded, exposed in the class payload, and shared with the enrollment listing through `classSummary`.
- **`confirmedCount` kept, and hardened**: the migration adds `CHECK ("confirmedCount" BETWEEN 0 AND capacity)`, so "never oversold" is now a database constraint rather than application logic alone. Its invariant is `confirmedCount == COUNT(enrollments)` — the roster is the authority, the counter is the cache that makes the capacity check one atomic statement.

## The payment-time seat check

Inside one transaction, in two passes: **every class must fit before any of them is written**, so a failure needs no compensating decrement and all-or-nothing falls out. The class row is read inside the transaction (never trusted from the selection), and the conditional `updateMany` remains as a backstop that throws on zero rows rather than under-counting.

The transaction body returns a discriminated result; the service maps it to an `ApiError` **after** commit, so the failure record (a failed charge plus the cancelled booking) survives. Order: card decision → status/lapsed checks → duplicate re-check → seat check → claim the order → take the seats and register.

A booking has exactly one class (the API books one class for N children), so "every class must fit before any of them is written" is a single test, not a per-class map — and the seat claim happens **after** the order is claimed, so nothing is taken for a booking somebody else already paid for.

## Migration

Hand-written (`20260928010000_booking_orders`): the old per-child `Booking` becomes `BookingItem` and a new `Booking` (order) takes its name, so SQLite rebuilds tables — which silently drops the hand-added partial unique index. The migration copies rows forward, converts **every money column with `/ 100.0`**, backfills one single-item order per existing booking, and **re-appends `Booking_confirmed_unique` on `BookingItem`**.

## Rollback

Nothing has shipped and the seed regenerates everything: drop the migration directory and run `npm run reset` (the user runs it — Prisma refuses `migrate reset` for agents). The one irreversible step would be losing `Booking_confirmed_unique`; it is verified explicitly below. The third migration (`20260928030000_seat_indexes`) only drops an unread column and swaps two indexes, so it needs no rollback of its own.

## Verified (2026-09-28)

- `npx prisma migrate deploy` applied cleanly; `prisma migrate status` clean; **drift check empty** (`migrate diff --from-migrations … --to-schema …` exits 0), so the hand-written SQL produces exactly the schema Prisma expects.
- Row counts unchanged (Booking 10 → 10 orders + 10 items, PaymentAttempt 10 → 10 payments), money converted (5000 → 50), no orphans, `PRAGMA foreign_key_check` clean.
- **The partial index still bites**: `Booking_confirmed_unique` exists on `BookingItem` with its `WHERE status='confirmed'` clause, and a raw duplicate confirmed insert throws `UNIQUE constraint failed`.
- `npm test` — **128 tests, 16 files, green**, including the group race looped 5× (exactly one winner, counter == confirmed items == roster, loser fully cancelled with a *failed* charge and no refund), all-or-nothing at both losing sizes, declined/malformed cards, double-pay, cancel/refund exactly-once, the sweep (both orders against payment, idempotency, the `startsAt` disjunct, predicate complement), the envelope walk over every route, and the counter invariant after every mutating test.
- `npm run typecheck` — clean.
- Live walkthrough on `npm run dev`: 2-child booking (amount 100, `expiresAt` ending `Z`) → paid with 4242 → roster shows both children → a second booking paid with `…0002` → `402 CARD_DECLINED`, booking `payment_failed`, nothing booked.
- `npm run sweep` — reported "nothing to release" when all holds were live, and "Released 1 selection(s): 1 seat(s) back on the board" after a hold was lapsed by a minute.

### Enrollments (2026-09-28)

- Second hand-written migration (`20260928020000_enrollments`): parks `BookingItem`, rebuilds it without `status`, creates `Enrollment`, **backfills from the parked rows while the old status column still exists**, then rebuilds `TrialClass` with `description` and the CHECK.
- `migrate deploy` applied; `migrate status` clean; **drift check empty** — which is what proves the hand-written SQL still matches Prisma's model *even with a CHECK constraint Prisma does not model*.
- **Backfill exact**: 8 enrollments for 8 previously-confirmed lines, per-class counts equal to each `confirmedCount`, no orphans, `PRAGMA foreign_key_check` clean, and every other table's row count unchanged.
- **Both new constraints bite**: a raw duplicate enrollment throws `UNIQUE constraint failed`, and a raw update pushing `confirmedCount` past `capacity` throws the CHECK.
- `npm test` — **132 tests, 16 files, green**, including new cases: paying registers the children, cancelling removes the registrations, a child who is only holding a selection has no enrollments, a second booking for an already-registered child is refused, and the enrollment listing returns exactly that child's classes (403 for another parent's child, 404 unknown, 401 unauthenticated).
- Live walkthrough: Alya's registered classes read 2 before paying, 3 after (the new class appears), the roster shows both children, and after a cancel the refund is recorded, the roster empties, the registrations are gone and the seats are back.
- Three bugs found by the suite during this change, all in wiring rather than design: the hold predicate still filtered on the removed item status; the booking create still wrote it; and `wipeAll` had not been taught the new table (in the one place its order is defined).

### Cleanup pass (2026-09-28, `/simplify` — four reviewers: reuse, simplification, efficiency, altitude)

- Third migration `20260928030000_seat_indexes` applied to the dev database; **`migrate diff --from-config-datasource --to-schema` reports "No difference detected"**, so the hand-written SQL still produces exactly the schema Prisma expects.
- **Both old guarantees re-verified by biting, not by existing**: the `TrialClass_seats_within_capacity` CHECK rejects a raw over-capacity update, and a raw duplicate enrollment still throws `UNIQUE constraint failed`. The migrated database kept its 13 `BookingItem` rows and its 8 enrollments, and `SUM(confirmedCount) == COUNT(enrollments)` still holds.
- The dropped column and the swapped indexes were verified in the database itself (`PRAGMA table_info` / `index_list`): `confirmedAt` gone, `Enrollment_classId_idx` and `Booking_status_expiresAt_idx` present, `Booking_parentId_status_idx` gone.
- `npm test` — **136 tests, 16 files, green, 11.3 s** (the pass before the cleanup was 132 tests in ~17 s). Five `parseUtc` tests went with the function; the malformed-body, middleware-coverage and `canCancel`/server-agreement tests arrived; and the suite got faster because fixture logins now mint the session cookie instead of paying an argon2id verify each: ~120 verifies ≈ 5.3 s of CPU, measured by the efficiency reviewer. `cancellability` also gained unit coverage of all four verdicts — the rule the cleanup centralised had none, which was the reviewer's point.
- `npm run typecheck` — clean.
- Live walkthrough over HTTP on a real server (`npx tsx src/index.ts`): login → classes (seats, holds, descriptions) → a child's enrollments → a malformed body answering `400 MALFORMED_JSON` with the envelope. The write path was exercised end to end by the suite (book → pay → roster → cancel → seats back), and `npm run sweep` printed both messages against test data.
- **`/security-review` (2026-09-28): clean** — no finding at or above the reporting bar. Traced: every route against the auth gate and the mounting order (including that `/students/*` and `/bookings/*` cover the bare paths, and that the late-registered wildcard middleware leaves `/api/auth/*` public), the ownership checks (`ownedBooking`, `ownedStudent`, the active-child filter), JWT handling (algorithm pinned to HS256, signature and `exp` verified, claims type-checked), the fail-closed session secret, argon2id, card handling (only `maskCard`'s last four is ever stored or returned, and the full number is never logged), and the error mapping (no `passwordHash`, no unmapped rows, generic 500s). No raw SQL, `eval`, or subprocess use outside the generated client.
- Reviewer findings deliberately **not** fixed, recorded so they are not re-litigated: the `Promise.all`s inside transactions (they serialize on one synchronous connection — they cost nothing, they only mis-signal); the per-item `bookingItem.update` loop on cancel (each line writes its own price as its refund); the route-level result switches (the plan's deliberate post-commit mapping, exhaustive and typed); `Payment.payload`/`reversalOfId`; and the seed/fixture duplication of "a confirmed booking", which the fixture needs in order to *build* states the pay path cannot produce (declined, seat-taken, refunded) — the pair that must agree (counter + registrations) is shared, and only the surrounding construction is not.
</phase-plan>

<feedback>
<!-- Where the plan disagrees with the original request: better ideas, with explanations. -->

- **No separate holds table** (asked: "should we hold or create a table to handle this one?"). The booking row *is* the hold. A holds table would either duplicate the status column that already expresses "selected", or become a hard reservation that makes the assignment's own last-seat race unreachable — B could never select the seat A is holding. Numbered seats would be the moment to add one.
- **Success derived from the card number** rather than a client-supplied `outcome`. A caller-declared outcome makes the API's success path self-reported, which is the dishonesty the assignment warns about; it also matches how real gateways' test cards work.
- **The seat check runs at payment, not only at selection.** The friendly check at selection exists for a fast, clear failure; only the payment-time check is authoritative, because seats can go while a parent is typing their card.
- **A malformed card leaves the hold live; a declined card does not.** Deliberate and documented: `payment_failed` is terminal (the parent rebooks), while a bad card number is a typo worth retrying in place.
</feedback>

<risks>
- **The partial index vanishing in the table rebuild** — the only failure in this phase that would have been silent. Mitigated by hand-editing the migration and by proving the index rejects a duplicate, not merely that it exists.
- **`pending_payment` with a past `expiresAt` is a legal state** ("not yet swept"). Any code treating the status alone as live is wrong; tests pin the behaviour in all three read paths and in payment.
- **Predicate drift** between the sweep and liveness — the bug class that already bit this codebase once — is pinned against `liveHoldItemWhere`, the predicate the reads actually run. (`liveHoldWhere`, the order-level restatement that nothing called, is gone; pinning a definitional pair instead of the rule in use was the guard protecting the wrong thing.)
- Money as a JSON number drops trailing zeros; a consumer doing float arithmetic on money does so knowingly, while storage and totals stay exact.
</risks>

<open-questions>
- Seat-loser refund policy is moot now (pre-auth means the loser is never charged), but the cancellation window on a *paid* booking remains the only refund path — worth stating in the README.
- Phase 3's UI plan says "mock pay (success/failure buttons)"; with the outcome derived from the card, those become "good card / declining card" buttons.
</open-questions>
