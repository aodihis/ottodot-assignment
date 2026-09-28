# Plan — Phase 4: Write-up + demo

Status: draft
Iteration: 4

<shared-context>
<!-- Restated in every plan file so context survives across phases. -->

## Assignment (source of truth)

Build the smallest working slice of a **trial-class booking** system: a parent books a trial class for a child and pays (mock), the booking status is shown, and the team can see the roster; 4 confirmed seats per class. Must prevent or handle duplicate confirmed bookings, overbooking, payment failure not joining the roster, and the required **last-seat race** (A and B grab the last seat, B pays first — at most one ends up confirmed).

Submission: a public GitHub repo with README.md, the implementation, seed data, tests, and AI_USAGE.md (this repo's addition), plus a short video walkthrough.

The README must explain: the approach, why it was chosen, the tradeoffs accepted, and a backend/design section covering the data model, key endpoints/functions, booking statuses, how duplicates are prevented, how payment failure is handled, how two users competing for the last seat are handled, and which checks belong in the UI, backend, database, or a background job.

## User stories

| # | Story | Status |
|---|-------|--------|
| 1 | As a developer/reviewer, I can reset+seed demo data in one command, so the demo runs in minutes | done (Phase 1) |
| 2 | As a parent or admin, I can log in (seeded account or my own registration), so the API is session-gated | done (Phase 1) |
| 3 | As a parent, I can see my children and trial classes with seats remaining | done (API; UI in Phase 3) |
| 4 | As a parent, I can book a trial class for my child and see the booking status after submission | done (Phase 2; Phase 3 UI) |
| 5 | As a parent, I can mock-pay; on failure my child is not on the roster and I can retry | done (Phase 2; Phase 3 UI) |
| 6 | As a parent competing for the last seat, only the first successful payment confirms; the loser is clearly told and not charged | done (Phase 2; Phase 3 UI) |
| 7 | As an admin, I can list classes and view each class's confirmed roster | done (API; UI in Phase 3) |
| 8 | As a reviewer, I can run a test suite proving all invariants | done (131 tests; presented in Phase 4) |
| 9 | As a visitor, I can register with my email and password, so I can use the app without a seeded account | done (Phase 1) |
| 10 | As a parent, I can add and remove my own children | done (Phase 1) |
| 11 | As a parent, I can cancel a confirmed booking before the cancellation cutoff and receive a mock refund | done (Phase 2) |
| 12 | As a parent, my selection is held for a limited time, and released back to the class when it lapses | done (Phase 2) |

## Stack (concluded 2026-09-28)

TypeScript (Node 20+) · Hono + `@hono/node-server` · Prisma 7 + SQLite via the better-sqlite3 driver adapter · zod · hono/jwt session cookie + hash-wasm argon2id (pure WASM, no native binaries) · Svelte 5 + Vite SPA · Vitest · tsx / npm workspaces / concurrently.

## Decisions so far

- 2026-09-28 — Stack concluded (see above).
- 2026-09-28 — Soft holds: pendings don't consume seats; availability = `capacity − confirmedCount`; resolution at payment. This is what makes the assignment's race scenario reachable (B must be able to select A's last seat).
- 2026-09-28 — Authoritative capacity guard = conditional atomic `updateMany` on `TrialClass.confirmedCount` inside the confirm transaction; duplicate re-checked in the same transaction.
- 2026-09-28 — Serialization is structural: the better-sqlite3 driver adapter is one synchronous SQLite connection, which is what makes every check-then-act guard safe (it replaced a `connection_limit=1` URL parameter).
- 2026-09-28 — **A booking is an order with line items** (`Booking` + `BookingItem`), and a paid line writes an **`Enrollment`** (the registration): plain `UNIQUE(studentId, classId)` replaced the partial index `WHERE status = 'confirmed'`, so the duplicate guarantee no longer needs a predicate. `TrialClass` carries a hand-added `CHECK (confirmedCount BETWEEN 0 AND capacity)`; its invariant is `confirmedCount == COUNT(enrollments)`.
- 2026-09-28 — Pay is a conditional status transition (idempotent double-pay; 409 `BOOKING_NOT_PAYABLE` on failed/cancelled/expired).
- 2026-09-28 — Lazy expiry via conditional writes; no background job. Class-started rule (`startsAt <= now` → 409) and effective expiry `min(expiresAt, startsAt)`. `npm run sweep` retires lapsed selections as a demo surface; a selection never held a seat, so it releases nothing.
- 2026-09-28 — Money is a `Decimal` at 2 dp exposed as a JSON number (`price`, `amount`, `refundAmount`), not `priceCents` — the user's call, for debuggability.
- 2026-09-28 — Payment is mock: success is derived from the card number (4242 approves, `…0002` declines). The charge is decided *before* the seat guard (pre-authorisation), so the last-seat loser is never charged and needs no refund.
- 2026-09-28 — Auth in Phase 1 (seeded accounts; parent-scoped bookings; admin gate). Demo-grade by design — stated in the README.
- 2026-09-28 — Red-team review (13 findings) accepted and folded into the design.
- 2026-09-28 — Deferred: pre-auth vs charge-then-refund (decided in Phase 2), roster auth assumption.
- 2026-09-28 — Password hashing is hash-wasm argon2id (pure WASM, no native binaries — chosen so `npm install` works on whatever OS the reviewer uses). Registration is public; children are soft-deleted; cancelling a confirmed booking before the cutoff refunds and releases the seat.
</shared-context>

<phase-plan>
## Goal

Turn the implementation into a submission: a README a reviewer can follow without asking questions, an AI_USAGE.md, a repeatable demo path for the video, and a final end-to-end verification on a clean checkout.

## Steps (simple breakdown — detailed planning happens at this phase's iteration start)

1. `README.md`: setup + run commands, seeded accounts, the demo walkthrough; **approach / why / tradeoffs**; backend design section answering every question the assignment lists (data model, endpoints, statuses, duplicates, payment failure, last-seat race, where each check lives); assumptions, cuts, what a real deployment would add (monitoring, background expiry, real payments), and time spent.
   Honesty items that must appear: the seeded emails (they are unregisterable — registering one returns 409), `npm run reset` is required if a `*.db` predates the argon2 swap (old scrypt hashes will not verify), the cancellation cutoff is a UTC duration rather than calendar days, paying inside the cancellation window stays legal, and the mock-payment refund loop is where a real abuse policy would live.
2. `AI_USAGE.md` (draft for user review): how the work was planned and built with Claude Code, what was reviewed/red-teamed, what was rejected.
3. `npm run demo` walkthrough script for the video.
4. Final verification on a clean checkout: `npm install && npm run reset && npm test`, run the app, walk both views, run the last-seat race demo, confirm the README's commands are exactly what was run.

## Out of scope (this phase)

- CI, deployment, Docker, badges, license files, benchmark numbers.
</phase-plan>

<feedback>
<!-- Where the plan disagrees with the original request: better ideas, with explanations. -->

- The README will show the test **output** for the race rather than only describing it. Claiming correctness without visible evidence is the weakest part of most submissions.
- The write-up states plainly what was intentionally not built (hard holds, background expiry, real auth hardening) and why — scope control is explicitly a grading criterion, so the cuts are documented as decisions, not gaps.
</feedback>

<risks>
- README drift: documenting commands or behavior that no longer match the code. Mitigation: step 4 re-runs every documented command on a clean checkout and fixes the README, not the claim.
- Time overrun from polishing prose. Mitigation: the README sections above are the checklist; stop when they are answered.
</risks>

<open-questions>
- Whether to include the two-browser race in the video or a terminal-driven one (a scripted `npm run demo` is more repeatable; two browsers are more convincing).
- How much of the red-team review history belongs in AI_USAGE.md (recommendation: summarize the findings and the accepted fixes, not the transcripts).
</open-questions>
