# Plan — Phase 2: Booking & payment domain + invariants

Status: draft
Iteration: 2

<shared-context>
<!-- Restated in every plan file so context survives across phases. -->

## Assignment (source of truth)

Build the smallest working slice of a **trial-class booking** system. A parent picks a child and an available trial class, submits a booking, passes a mock payment step, and sees the booking status. An admin/teacher can see the class roster. Trial classes cap at **4 confirmed** students.

Must prevent or handle: duplicate confirmed bookings for the same child+class, overbooking past 4, payment failure that must NOT add the child to the confirmed roster, and the required **last-seat race** (A and B grab the last seat; B pays first; only one booking may end up confirmed).

Regular enrollment is explicitly out of scope. Deliverables: public GitHub repo with README.md (approach, tradeoffs, data model, endpoints, statuses, which checks live in UI/backend/DB/job), implementation, seed data, tests, AI_USAGE.md, plus a short video walkthrough.

## User stories

| # | Story | Status |
|---|-------|--------|
| 1 | As a developer/reviewer, I can reset+seed demo data in one command, so the demo runs in minutes | planned (Phase 1) |
| 2 | As a parent or admin, I can log in with a seeded account, so the API is session-gated | planned (Phase 1) |
| 3 | As a parent, I can see my children and trial classes with seats remaining | planned (Phase 1) |
| 4 | As a parent, I can book a trial class for my child and see the booking status after submission | planned (Phase 2) |
| 5 | As a parent, I can mock-pay; on failure my child is not on the roster and I can retry | planned (Phase 2) |
| 6 | As a parent competing for the last seat, only the first successful payment confirms; the loser is clearly told and not charged | planned (Phase 2) |
| 7 | As an admin, I can list classes and view each class's confirmed roster | planned (Phase 2) |
| 8 | As a reviewer, I can run a test suite proving all invariants | planned (Phase 2 + 4) |
| 9 | As a visitor, I can register with my email and password, so I can use the app without a seeded account | planned (Phase 1) |
| 10 | As a parent, I can add and remove my own children | planned (Phase 1) |
| 11 | As a parent, I can cancel a confirmed booking before the cancellation cutoff and receive a mock refund | planned (Phase 2) |

## Stack (concluded 2026-09-28)

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript (Node 20+) | one language across API/web/tests |
| API | Hono + @hono/node-server | lightweight; `app.request()` enables tests without a listening server |
| ORM/DB | Prisma 7 + SQLite through the better-sqlite3 driver adapter | user's choice; schema-first typed models, zero-infra DB |
| Validation | zod | boundary validation; closed vocabularies (role, booking status, cancel reason, payment outcome) are Prisma enums |
| Auth | hono/jwt signed httpOnly cookie + **hash-wasm** (`argon2id`, pure WASM) | session-gated API; zero native binaries — installs on any OS/arch |
| Frontend | Svelte 5 + Vite SPA | user's choice; SPA (no SSR) |
| Tests | Vitest | TS-native, runs against `app.request()` with a per-file SQLite db |
| Tooling | tsx, npm workspaces, concurrently | monorepo: `api/` (with its own tests), `web/` |

## Decisions so far

- 2026-09-28 — **Soft holds**: `pending_payment` does not consume seats; availability = `capacity − confirmedCount`. Two parents can hold pendings on the same last seat — that is what makes the required race scenario reachable.
- 2026-09-28 — **Authoritative capacity guard**: conditional atomic `updateMany({ where: { id, confirmedCount: { lt: capacity } }, data: { confirmedCount: { increment: 1 } } })` inside the confirm transaction; duplicate re-checked in the same transaction.
- 2026-09-28 — Status vocabulary is the Prisma enum `BookingStatus` / `CancelledReason` (generated as string-literal unions), so the pay/cancel transitions compare enum values rather than loose strings; see `phase-1.md`.
- 2026-09-28 — Serialization is **structural**: Prisma 7's better-sqlite3 driver adapter is a single synchronous connection, so statements and transactions cannot interleave — that is what makes the check-then-act guards safe. (It replaces an earlier `?connection_limit=1` URL parameter, which was load-bearing and easy to drop by accident.)
- 2026-09-28 — **DB backstop**: `CREATE UNIQUE INDEX Booking_confirmed_unique ON Booking(studentId, classId) WHERE status = 'confirmed'` in a hand-edited migration (requires `migrate dev`, not `db push`); Prisma `P2002` → 409.
- 2026-09-28 — `POST /bookings` runs in a transaction and sweeps expired pendings before the duplicate check.
- 2026-09-28 — **Pay = conditional status transition** (`updateMany where status='pending_payment' and expiresAt > now and class not started`): double-pay → 200 idempotent; pay of failed/cancelled/expired → 409 `BOOKING_NOT_PAYABLE`.
- 2026-09-28 — Class-started rule: reject when `startsAt <= now` (409 `CLASS_ALREADY_STARTED`); effective hold expiry = `min(expiresAt, startsAt)`. All expiry handling is a conditional write, never read-and-decide. Lazy expiry — no background job.
- 2026-09-28 — `priceCents` snapshotted onto Booking at creation.
- 2026-09-28 — Auth in Phase 1: seeded accounts, signed session cookie, `role=admin` for `/api/admin/*`, parents scoped to their own children.
- 2026-09-28 — Red-team review (13 findings) accepted; see `phase-1.md` for the full list.
- 2026-09-28 — Seat-loser payment model (pre-auth vs charge-then-refund) — **open question below**, to be concluded at this phase's iteration start.
- 2026-09-28 — **Cancellation with refund**: cancelling a `confirmed` booking before its cutoff (409 `CANCELLATION_WINDOW_CLOSED` after) sets `refundedAt`/`refundCents`, flips the status to `cancelled`, and decrements `confirmedCount`. The status claim (`updateMany where status='confirmed'`) is the token that makes refund + seat release exactly-once; a concurrent double-cancel gets an idempotent 200 and never refunds twice.
- 2026-09-28 — A `pending_payment` cancel takes **no seat action** (it never held one) and never refunds. The cutoff gates the **refund**, not the cancel — a hold can be cancelled right up to `startsAt`.
- 2026-09-28 — The cutoff is a **duration** (`startsAt − CANCELLATION_CUTOFF_DAYS × 86_400_000`), computed at read time, never stored; the env var defaults to 5 and is read at call time. Paying inside the cancellation window stays legal (accepted asymmetry, documented in the README).
- 2026-09-28 — Removing a child who has an active booking is blocked (409 `STUDENT_HAS_ACTIVE_BOOKING`) rather than auto-cancelling — auto-cancel would refund money the parent never asked to refund, bypassing the cutoff on the way.
- 2026-09-28 — Password hashing is hash-wasm argon2id (pure WASM, no native binaries); registration is public and parents are soft-deleted (`Student.removedAt`).
</shared-context>

<phase-plan>
## Goal

The booking lifecycle works end to end and every assignment invariant holds under concurrency: book → pay (success/failure) → confirmed / failed / cancelled, with the roster and `confirmedCount` never lying, and exactly one winner in the last-seat race.

## Steps (simple breakdown — detailed planning happens at this phase's iteration start)

1. Booking creation: transactional `POST /api/bookings` — parent-owns-student check, expiry sweep, duplicate check, fail-fast guards (full / class started); snapshots `priceCents`, sets `expiresAt`.
2. Payment: `POST /api/bookings/:id/pay` — one interactive transaction: conditional status transition, duplicate re-check, conditional `confirmedCount` seat guard, `PaymentAttempt` record; success → `confirmed`, mock failure → `payment_failed` (child not on roster, rebookable).
3. Cancel: `POST /api/bookings/:id/cancel` in one transaction, check order 404 → 403 → `CLASS_ALREADY_STARTED` → `CANCELLATION_WINDOW_CLOSED` → state branch. `confirmed` inside the window: claim it (`updateMany where status='confirmed'`, writing `refundedAt`/`refundCents`), then conditionally decrement `confirmedCount` (`where confirmedCount > 0`); zero rows there means drift → throw, rolling the claim back. `pending_payment`: cancel, no seat or refund action. Already `cancelled`: idempotent 200. `payment_failed`: 409 `BOOKING_NOT_CANCELLABLE`. Plus the roster endpoint (with its `cancelled` refund list) and `canCancel`/`cancellationDeadline` on booking payloads — verify: the cancel cases in step 4.
4. Test matrix (the core of this phase): duplicate (confirmed / unexpired pending / expired-then-allowed), capacity (4th confirms, 5th `SEAT_TAKEN`), payment failure (roster unchanged, rebookable), **last-seat race** (deterministic B-then-A, plus `Promise.all` looped 5–10× asserting exactly 1 winner, `confirmedCount ≤ 4`, and `counter == COUNT(confirmed) == roster length`), double-pay (sequential idempotent + concurrent), pay-after-failure, pay-after-cancel, class-already-started, concurrent POSTs for the same (student, class), expiry boundary, 404s.
   Cancel additions: confirmed inside window → refund fields set, `confirmedCount` down exactly 1, student off the roster; outside window → 409 with the booking untouched and the counter unchanged; after `startsAt` → `CLASS_ALREADY_STARTED` (asserts check ordering); sequential double-cancel idempotent with one refund; concurrent `Promise.all` double-cancel → exactly one decrement; cancel-then-rebook same (student, class) → 201; a `SEAT_TAKEN` confirm succeeds after a cancel frees the seat; counter floor holds when forced to 0; the invariant assertion runs after every mutating test.
5. Conclude the pre-auth vs charge-then-refund decision and record it in the Decisions list.

## Out of scope (this phase)

- Real payment integration, refunds beyond the mock, waitlists, notifications, background jobs (expiry is lazy by design), UI (Phase 3), write-up (Phase 4).
</phase-plan>

<feedback>
<!-- Where the plan disagrees with the original request: better ideas, with explanations. -->

- The assignment's suggested `payment_attempts` table is kept, but attempts are written inside the same transaction as the state change — otherwise an attempt record can exist for a payment that never took effect (exactly the dishonest-roster failure the assignment warns about).
- 409s on pay carry the booking + attempt in the body. A bare error code would make "you were not charged" unverifiable from the client, which is the story the README has to tell.
</feedback>

<risks>
- The last-seat race is timing-dependent in reality and deterministic in tests. Mitigation: assert invariants (exactly one confirmed, counter consistency) rather than a specific interleaving, and loop the concurrent test.
- The conditional seat guard is the only guard that survives without serialization; everything else depends on the single synchronous connection the driver adapter provides. Mitigation: that property is structural rather than a URL parameter someone can delete, and the crossed race tests assert it.
- Test-suite slowness from per-file databases on Windows. Mitigation: one temp db per worker, `forks` pool, `$disconnect()` in `afterAll`.
</risks>

<open-questions>
- Seat-loser model: pre-auth (checks first, loser never charged) vs charge-then-refund (realistic but adds `refunded` state and a refund path to explain). Recommendation: pre-auth — fewer states, and the assignment only requires that the loser not end up confirmed.
- Hold duration (`expiresAt` offset) — pick a demo-friendly value (e.g. 15 min) and state it in the README.
</open-questions>
