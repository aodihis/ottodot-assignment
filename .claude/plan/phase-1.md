# Plan — Phase 1: Foundation (scaffold + data model + auth + contract)

Status: done (2026-09-28)
Iteration: 1

<shared-context>
<!-- Restated in every plan file so context survives across phases. -->

## Assignment (source of truth)

Build the smallest working slice of a **trial-class booking** system. A parent picks a child and an available trial class, submits a booking, passes a mock payment step, and sees the booking status. An admin/teacher can see the class roster. Trial classes cap at **4 confirmed** students.

Must prevent or handle: duplicate confirmed bookings for the same child+class, overbooking past 4, payment failure that must NOT add the child to the confirmed roster, and the required **last-seat race** (A and B grab the last seat; B pays first; only one booking may end up confirmed).

Regular enrollment is explicitly out of scope. Deliverables: public GitHub repo with README.md (approach, tradeoffs, data model, endpoints, statuses, which checks live in UI/backend/DB/job), implementation, seed data, tests, AI_USAGE.md, plus a short video walkthrough.

## User stories

| # | Story | Status |
|---|-------|--------|
| 1 | As a developer/reviewer, I can reset+seed demo data in one command, so the demo runs in minutes | done |
| 2 | As a parent or admin, I can log in (seeded account or my own registration), so the API is session-gated | done |
| 3 | As a parent, I can see my children and trial classes with seats remaining | done (API; UI in Phase 3) |
| 4 | As a parent, I can book a trial class for my child and see the booking status after submission | planned (Phase 2) |
| 5 | As a parent, I can mock-pay; on failure my child is not on the roster and I can retry | planned (Phase 2) |
| 6 | As a parent competing for the last seat, only the first successful payment confirms; the loser is clearly told and not charged | planned (Phase 2) |
| 7 | As an admin, I can list classes and view each class's confirmed roster | done (API; UI in Phase 3) |
| 8 | As a reviewer, I can run a test suite proving all invariants | in progress (Phase 2 + 4) |
| 9 | As a visitor, I can register with my email and password, so I can use the app without a seeded account | done |
| 10 | As a parent, I can add and remove my own children | done |
| 11 | As a parent, I can cancel a confirmed booking before the cancellation cutoff and receive a mock refund | planned (Phase 2) |

## Stack (concluded 2026-09-28)

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript (Node 20+) | one language across API/web/tests; Hono/Prisma are TS-first |
| API | Hono + @hono/node-server | lightweight, TS-first; `app.request()` enables tests without a listening server |
| ORM/DB | Prisma 7 + SQLite through the better-sqlite3 driver adapter | user's choice; schema-first typed models, zero-infra DB; the adapter is a single synchronous connection (see decisions) |
| Validation | zod | boundary validation for request bodies; closed vocabularies (role, booking status, cancel reason, payment outcome) are Prisma enums |
| Auth | hono/jwt signed httpOnly cookie + **hash-wasm** (`argon2id`, pure WASM) | session-gated API; **zero native binaries** — installs on any OS/arch, no node-gyp fallback |
| Frontend | Svelte 5 + Vite SPA | user chose Svelte; SPA (no SSR) — Hono serves the built SPA, Vite proxies `/api` in dev |
| Tests | Vitest | TS-native, runs against Hono `app.request()` with a per-file SQLite db |
| Tooling | tsx (run TS), npm workspaces, concurrently | simple monorepo: `api/` (with its own tests), `web/` |

## Decisions so far

- 2026-09-28 — Stack concluded: Hono + Prisma + SQLite + Svelte SPA. (Prisma moved from 6.19.3 to 7.10 on 2026-09-28 — see the Prisma 7 decisions below.)
- 2026-09-28 — **Soft holds**: `pending_payment` bookings do NOT consume seats; availability = `capacity − confirmedCount`. Two parents can hold pendings on the same last seat; resolution happens at payment. This is what makes the required race scenario possible (B must be able to select A's last seat).
- 2026-09-28 — **Authoritative capacity guard**: denormalized `TrialClass.confirmedCount`, mutated only inside the confirm transaction via a conditional atomic `updateMany({ where: { id, confirmedCount: { lt: capacity } }, data: { confirmedCount: { increment: 1 } } })`. The duplicate guard is re-checked in the same transaction. Chosen over relying on isolation alone: explicit, testable, and safe under SQLite's single-writer rule.
- 2026-09-28 — **Serialization is structural, not configured.** Prisma 7 requires a driver adapter; for SQLite that is better-sqlite3 — a single synchronous connection, so statements and transactions cannot interleave at all. This replaces the earlier `?connection_limit=1` URL parameter, which was load-bearing and could be dropped by accident. Honest consequence: "concurrent" transactions in tests cannot physically interleave, so the race tests prove the **guards**, not the interleaving. The conditional seat guard alone makes oversell impossible; the duplicate-confirmed invariant also relies on this serialization plus the partial index.
- 2026-09-28 — **Closed vocabularies are enums, not free strings**: `Role`, `BookingStatus`, `CancelledReason`, `PaymentOutcome`. This corrects an earlier note in this plan claiming SQLite has no Prisma enums — SQLite has supported them since Prisma 6.2, and `prisma validate` accepts them here; they are stored as `TEXT` (no CHECK constraint), so the restriction is enforced by the generated types, not by the database. `TrialClass.subject` stays free text: a subject is descriptive data, not a closed state machine.
- 2026-09-28 — **Prisma 7 layout**: the connection url lives in `api/prisma.config.ts` (the schema's `datasource.url` is gone, and so is the `package.json#prisma` seed key); the client is generated into `api/src/generated/prisma` by the `prisma-client` generator and gitignored, regenerated by `postinstall`; `api/src/db.ts` owns the adapter and re-exports the instance type as `Db` (Prisma 7's `PrismaClient` is generic, so the bare class name is not assignable to an instantiated client).
- 2026-09-28 — **DB backstop**: a hand-edited migration adds `CREATE UNIQUE INDEX Booking_confirmed_unique ON Booking(studentId, classId) WHERE status = 'confirmed';` (Prisma can't declare partial indexes). Prisma `P2002` maps to 409. This requires the `prisma migrate dev` workflow — `db push` would drop the unknown index.
- 2026-09-28 — `POST /bookings` also runs in a transaction and sweeps expired pendings (conditional `updateMany` where `status='pending_payment' and expiresAt < now`) **before** the duplicate check.
- 2026-09-28 — **Pay is a conditional status transition** (`updateMany where status='pending_payment' and expiresAt > now and class not started`): double-pay of a confirmed booking → 200 idempotent; pay of failed/cancelled/expired → 409 `BOOKING_NOT_PAYABLE`.
- 2026-09-28 — Class-started rule: reject booking/payment when `startsAt <= now` (409 `CLASS_ALREADY_STARTED`); effective hold expiry = `min(expiresAt, startsAt)`.
- 2026-09-28 — **Lazy expiry**: expired pendings flip to `cancelled` when touched; no background job. All expiry handling is a conditional write, never read-and-decide.
- 2026-09-28 — `priceCents` is snapshotted onto Booking at creation so payment attempts can't disagree with a later price change.
- 2026-09-28 — **Auth**: `User` table (email, passwordHash, name, role `parent`|`admin`, createdAt); `Parent` links 1:1 to a User. Login = signed httpOnly session cookie (`hono/jwt`, `SESSION_SECRET` in `.env`). Every `/api` route except `/api/auth/*` requires a session; parents may book only their own children; `/api/admin/*` requires `role=admin`.
- 2026-09-28 — **Password hashing: `hash-wasm` argon2id** (pure WebAssembly, zero dependencies, `os: any`). Chosen over `@node-rs/argon2` and `argon2` because the grader may run any OS: no native binaries means `npm install` cannot fail on a platform/arch mismatch and there is no node-gyp fallback path. Parameters passed explicitly: `memorySize: 19456` KiB, `iterations: 2`, `parallelism: 1`, `hashLength: 32`, 16-byte random salt, `outputType: 'encoded'` (PHC string). Lives in `api/src/helpers/password.ts`.
- 2026-09-28 — **Registration is public** (`POST /api/auth/register`, auto-login) and hard-codes `role: 'parent'`; the request body's role is never read, so admin self-registration is impossible by construction. Admin/teacher accounts come from the seed only.
- 2026-09-28 — **Emails are normalized** (`trim().toLowerCase()`) before insert — SQLite `UNIQUE` is case-sensitive, so `A@x.com` and `a@x.com` would otherwise be two accounts. `User.email @unique` is the duplicate guard (`P2002` → 409 `EMAIL_TAKEN`).
- 2026-09-28 — **Children are soft-deleted**: `Student.removedAt`. A hard delete would hit the required `Booking.studentId` FK and would erase the name from past rosters. Every student lookup filters `removedAt: null` through one shared predicate (`api/src/helpers/students.ts`) — a missed filter would silently let a removed child be booked.
- 2026-09-28 — **No register flow** → superseded above; the earlier "seeded accounts only" decision applied to admins.
- 2026-09-28 — Svelte: plain Vite + Svelte SPA, no router library (two views: parent flow, admin roster).
- 2026-09-28 — Red-team review incorporated (13 findings, all accepted). Highest-impact mechanics: serialization as the backbone of every check-then-act guard (today structural — one synchronous connection — rather than a `connection_limit=1` URL parameter); the partial unique index as the duplicate-confirmed backstop; conditional-write expiry; conditional pay transition (idempotent double-pay); the expanded test matrix; Windows test-setup mitigations.
- 2026-09-28 — Svelte frontend confirmed as SPA (no SSR); seat-loser payment model (pre-auth vs charge-then-refund) deferred to the Phase 2 detailed plan — recommendation is pre-auth.
- 2026-09-28 — **Naming**: code is organised by module — `api/src/modules/<module>/<module>.routes.ts` (HTTP only: parse, call, respond) and `<module>.service.ts` (the logic); logic shared across modules lives in `helpers/`. (Corrected from an earlier `domains/` layout that had a vaguely named `current.ts`.)
- 2026-09-28 — **Tests live with the workspace they test**: `api/tests/{unit,integration}` with `api/vitest.config.ts` (the web app will carry its own). Integration tests run against a **real, separate database** — `TEST_DATABASE_URL` (default `api/prisma/test.db`), never the dev one, rebuilt from the migrations once per run in `globalSetup`, with test files executed sequentially so they don't overlap on the shared database.
</shared-context>

<phase-plan>
## Goal

A reviewer can `npm install && npm run reset`, register or log in with a seeded account, manage their children, and hit session-gated endpoints — proving the data model, the constraints, and the auth layer before any booking logic exists.

## Contract (v1)

Base: JSON under `/api`; errors are `{ "error": { "code", "message" } }`.

| Method | Path | Request | Responses |
|---|---|---|---|
| POST | `/api/auth/register` | `{email, password, name}` | 201 `{user}` + session cookie (auto-login) · 409 `EMAIL_TAKEN` · 422 `VALIDATION_ERROR` |
| POST | `/api/auth/login` | `{email, password}` | 200 `{user}` + session cookie · 401 `INVALID_CREDENTIALS` |
| POST | `/api/auth/logout` | — | 204, clears cookie |
| GET | `/api/auth/me` | — | 200 `{user, parent?, students?}` · 401 |
| GET | `/api/students` | — | 200 the session parent's non-removed children `[{id, name}]` · 401 |
| POST | `/api/students` | `{name}` | 201 `{student:{id, name}}` · 401 · 403 (admin) · 422 |
| DELETE | `/api/students/:id` | — | 204 · 401 · 403 `NOT_YOUR_STUDENT` · 404 `STUDENT_NOT_FOUND` · 409 `STUDENT_HAS_ACTIVE_BOOKING` |
| GET | `/api/classes` | — | 200 `[{id, title, subject, startsAt, durationMin, capacity, confirmedCount, pendingHolds, seatsAvailable, cancellationDeadline}]` · 401 |
| POST | `/api/bookings` | `{studentId, classId}` | 201 booking · 401 · 403 `NOT_YOUR_STUDENT` · 404 · 422 · 409 `DUPLICATE_ACTIVE_BOOKING` / `CLASS_FULL` / `CLASS_ALREADY_STARTED` |
| GET | `/api/bookings/:id` | — | 200 booking + attempts (owner parent or admin) · 401 · 403 · 404 |
| POST | `/api/bookings/:id/pay` | `{outcome: "success"\|"failure"}` | 200 `{booking, attempt}` (confirmed / payment_failed / idempotent retry) · 401 · 403 · 404 · 409 `{error, booking, attempt}` `SEAT_TAKEN` / `DUPLICATE_BOOKING` / `BOOKING_EXPIRED` / `BOOKING_NOT_PAYABLE` / `CLASS_ALREADY_STARTED` |
| POST | `/api/bookings/:id/cancel` | — | 200 cancelled (`parent_cancelled`) · 409 `CANCELLATION_WINDOW_CLOSED` / `BOOKING_NOT_CANCELLABLE` / `CLASS_ALREADY_STARTED` · 401 · 403 · 404 |
| GET | `/api/admin/classes` | — | 200 class list incl. `confirmedCount` + `pendingHolds` · 401 · 403 `FORBIDDEN` |
| GET | `/api/admin/classes/:id/roster` | — | 200 `{class..., roster:[{studentId, name, parentName, confirmedAt}], pendingHolds:[...], cancelled:[{studentId, name, refundedAt, refundCents}]}` · 401 · 403 |

Gating: every `/api` route except `/api/auth/*` requires a valid session cookie. Booking endpoints are parent-scoped (the student must belong to the session's parent, and must not be removed). `/api/admin/*` requires `role=admin`.

Convention: every 409 on pay includes the (cancelled) booking and the failed `attempt` in the body — that makes the "you were not charged" story visible. A client-requested mock failure returns 200 `payment_failed` (not a server error); documented in the README.

## Schema (Prisma, SQLite)

```prisma
model User         { id String @id @default(cuid()); email String @unique; passwordHash String; name String; role String @default("parent"); createdAt DateTime @default(now()); parent Parent? }
model Parent       { id String @id @default(cuid()); userId String @unique; user User @relation(fields: [userId], references: [id]); students Student[] }
model Student      { id String @id @default(cuid()); name String; parentId String; removedAt DateTime?; parent Parent @relation(fields: [parentId], references: [id]); bookings Booking[] }
model TrialClass   { id String @id @default(cuid()); title String; subject String; startsAt DateTime; durationMin Int @default(60); capacity Int @default(4); confirmedCount Int @default(0); priceCents Int @default(5000); bookings Booking[] }
model Booking      { id String @id @default(cuid()); studentId String; classId String; status String @default("pending_payment"); expiresAt DateTime; priceCents Int; cancelledReason String?; confirmedAt DateTime?; refundedAt DateTime?; refundCents Int?; createdAt DateTime @default(now()); attempts PaymentAttempt[]; @@index([classId, status]); @@index([studentId, status]) }
model PaymentAttempt { id String @id @default(cuid()); bookingId String; outcome String; reason String?; amountCents Int; createdAt DateTime @default(now()) }
```

Statuses: `pending_payment → confirmed | payment_failed | cancelled`; `cancelledReason: expired | seat_taken | duplicate_booking | parent_cancelled`.

- One source of truth for the status vocabulary: Prisma enums in `api/prisma/schema.prisma` (`Role`, `BookingStatus`, `CancelledReason`, `PaymentOutcome`). The generated client turns each into a string-literal union plus a const object, so `BookingStatus.confirmed === 'confirmed'` — no hand-rolled `BOOKING_STATUSES` array needed. On SQLite they map to plain `TEXT` with no CHECK constraint and require no migration; the generated types are the guard, and the database-level backstop stays the hand-added partial unique index.
- `parent_cancelled` covers both a cancelled hold and a refunded confirmation — `refundedAt` is the distinguisher, **not** a second reason value.
- Tests inject absolute `file:` URLs (forward slashes, one temp file per worker).

## Steps

1. Scaffold workspaces + tooling: root `package.json` (workspaces: `api`; `web` added in Phase 3), TypeScript config, `tsx`, Vitest; `.gitignore` += `node_modules`, `*.db*`, `.env` — verify: `npm install` succeeds.
2. Prisma schema (User, Parent→User, Student, TrialClass, Booking, PaymentAttempt) + `prisma migrate dev`, with the first migration hand-appended to add the partial unique index; `api/prisma.config.ts` (schema path, migrations path, seed command, datasource url) + `.env`/`.env.example` (`DATABASE_URL`, `TEST_DATABASE_URL`, `SESSION_SECRET`, `CANCELLATION_CUTOFF_DAYS`) — verify: `prisma migrate status` clean + a roundtrip query smoke test.
3. `api/src/helpers/password.ts`: hash-wasm argon2id `hashPassword`/`verifyPassword` (verify must return false, never throw, on a malformed or foreign hash) + `api/src/helpers/config.ts` reading `CANCELLATION_CUTOFF_DAYS` (default 5, `>= 0`) **at call time** so tests can drive both sides of the window — verify: `api/tests/unit/`.
4. Auth: `POST /api/auth/register` (auto-login, `role` forced to `parent`), `POST /api/auth/login|logout`, `GET /api/auth/me`, signed httpOnly cookie (`hono/jwt`), `requireAuth`/`requireAdmin` middleware — verify: `api/tests/integration/auth.test.ts` — register + cookie works, duplicate/case-variant email 409, `role:'admin'` in the body still creates a parent, wrong password 401, gated route 401 without session, parent on `/api/admin/*` → 403.
5. Seed (`api/prisma/seed.ts`, run with tsx): users `admin@demo.test` + 3 parents (password `password123`, printed by the seed), students, and classes — 0 confirmed (4 free), 3 confirmed (last seat), 4 confirmed (full), one with duplicate + failed-payment history, one at `now + 7d` (inside the refund window) and one at `now + 2d` (window closed). **Relative dates (`now + n days`) so demo data never goes stale** — verify: `npm run reset` (drop db → migrate → seed) → login + list classes.
6. Student and read endpoints behind gating: `GET /api/students` (session parent's children, `removedAt: null`), `POST /api/students`, `DELETE /api/students/:id` (409 `STUDENT_HAS_ACTIVE_BOOKING` when the child has an active booking), `GET /api/classes` (+ computed `cancellationDeadline`), `GET /api/admin/classes`, `GET /api/admin/classes/:id/roster` — verify: `api/tests/integration/` smoke tests via `app.request()` incl. 401/403, plus a manual curl with cookie.
7. Update this file's status and the user-story statuses as work completes.

### Verified (2026-09-28)

- `npm test` — 60 tests, 9 files, green, running against a real test database of its own (`TEST_DATABASE_URL` → `api/prisma/test.db`, rebuilt from the migrations each run). Unit: argon2, cutoff config, session secret, Prisma error codes, student scope, test-url resolution; integration: auth/register/gating, students CRUD, classes + roster.
- `npm run typecheck` — clean.
- Prisma 7 verified: `prisma migrate status` reports the schema up to date, `prisma generate` writes `api/src/generated/prisma`, the CLI (`prisma.config.ts`) and the app's adapter open the same file — login and `GET /api/classes` return the rows the CLI just seeded, and `better-sqlite3` loaded from a prebuild (no compile).
- `npm test -- tests/unit/http.test.ts` — the documented single-file invocation runs exactly that file.
- `npm run seed` — seeds 4 accounts and 5 classes with relative dates; prints the last-seat class (3/4) and the inside-the-cutoff class (starts in 2d).
- Manual curl against `npm run dev`: 401 without a cookie; register normalises `Newbie@Example.com` → `newbie@example.com` with `role: parent`; login/me/students/classes as `parent1@demo.test`; `/api/admin/classes` as a parent → 403; add child → 201, delete → 204, delete again → 404; deleting a child with confirmed bookings → 409 `STUDENT_HAS_ACTIVE_BOOKING`; admin roster shows three confirmed students with parent names; unknown class roster → 404.
- `npm run reset` (drop + migrate + seed) could **not** be run by the agent: Prisma 6 refuses `migrate reset` when it detects an AI agent unless the user consents (`PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`). The drop-and-recreate path is nevertheless exercised by every test file, which runs `prisma migrate deploy` against a fresh temporary database. **Open item for the user:** confirm whether to whitelist this command for the agent.

### Migration / rollback (Phase 1)

- The schema change is additive — `Student.removedAt`, `Booking.refundedAt`, `Booking.refundCents` — plus one hand-added partial index inside the init migration. Rollback is: drop the migration, run `npm run reset`. There is no production data anywhere, so no backfill or dual-write path is needed.
- The argon2 swap is **not** forward compatible: password hashes written by the earlier scrypt design cannot be verified. A `*.db` created before it must be reset rather than migrated. `verifyPassword` returns false instead of throwing, so the failure surfaces as a 401, never a crash.
- Later phases add columns only; `confirmedCount` needs no backfill because the seed maintains it.

## Out of scope (this phase)

- All booking/payment logic (Phase 2), the Svelte UI (Phase 3), README/AI_USAGE (Phase 4).
- No admin self-registration or admin-creation endpoint (seed only), no email verification, no password reset, no rate limiting, no login lockout.

## File-level scope

`package.json`, `tsconfig.json`, `api/package.json`, `api/vitest.config.ts`, `api/prisma/schema.prisma`, `api/prisma/migrations/*`, `api/prisma/seed.ts`, `api/src/{app,index,db}.ts`, `api/src/modules/auth/*`, `api/src/modules/students/*`, `api/src/modules/classes/*`, `api/src/helpers/{password,config,http,students}.ts`, `api/tests/helpers/*`, `api/tests/unit/*`, `api/tests/integration/*`, `.env.example`.
</phase-plan>

<feedback>
<!-- Where the plan disagrees with the original request: better ideas, with explanations. -->

- Rejected: **hard holds** (a pending booking decrementing available seats). It would deadlock the assignment's own race scenario — B could never select the seat A is holding, so the required "B pays first, A loses" path becomes unreachable. Soft holds with resolution at payment is the model the scenario implies.
- Rejected: **seat check at booking time only**. A seat can be taken between pending and payment, so capacity must be enforced at confirm time. Booking-time check exists only as a fast, friendly failure.
- Rejected for hashing: `@node-rs/argon2` (prebuilt napi binaries — good coverage, but still a platform matrix) and `argon2` (node-gyp compile fallback, needs VS Build Tools + Python on Windows). `hash-wasm` removes the install failure mode entirely.
- Kept: `confirmedCount` denormalization. A `COUNT(*)` at confirm time is also correct, but the conditional `updateMany` is atomic in one statement and trivially testable; drift is guarded by asserting `counter == COUNT(confirmed) == roster length` in tests.
</feedback>

<risks>
- Prisma 7 + SQLite concurrency: oversell is impossible regardless (the conditional `updateMany` is atomic under SQLite's single-writer rule), but the duplicate-confirmed invariant relies on serialization — now structural, one synchronous connection — plus the partial unique index backstop (P2002→409) and looped race tests. A regression surfaces as a loud P2002, never as silent oversell.
- The driver adapter is a native module (`better-sqlite3`: prebuilds for mainstream platforms, then a node-gyp fallback). Root `package.json` pins `allowScripts` so npm 11 actually runs its install script on a fresh clone, and a missing prebuild fails loudly at install rather than silently at runtime. There is no pool to starve any more, so the earlier `maxWait`/`timeout` tuning no longer applies; transactions are still kept short and never await non-`tx` work.
- Windows specifics: deleting an open SQLite file throws EPERM → the test database is deleted **before** the run (in `globalSetup`), not after, and clients `$disconnect()` in `afterAll`; the `forks` pool is set explicitly (Prisma's engine plus worker `threads` is a known Windows pain); npm scripts avoid inline `FOO=bar` env syntax (use `--env-file`); root `package.json` pins `allowScripts` so Prisma's engine postinstall runs on a fresh clone (npm 11 otherwise skips it); Defender can transiently hold the db file.
- **Password hashes are not portable across the argon2 swap**: any `*.db` created before it holds scrypt hashes that argon2 will reject. `npm run reset` is therefore required; `verifyPassword` must return false rather than throw on the old format. No rehash-on-login path (cut).
- **A missed `removedAt: null` filter lets a removed child be booked** — the one bug that corrupts a roster → one shared predicate in `helpers/students.ts` + a test that a removed child cannot be booked.
- `confirmedCount` drift → mutated only inside the confirm transaction; invariant asserted after every mutating test.
- Timezone: store UTC, render local; seed uses relative dates so demo data never rots.
- Auth is demo-grade by design (single secret, no rate limiting, no email verification) — stated as an explicit decision in the README; `SESSION_SECRET` stays in `.env` (gitignored); WASM argon2 needs no native build on Windows.
- Registration and the seed overlap: seeded emails (`admin@demo.test`, `parent1..3@demo.test`) are unregisterable (409) — the README must list them so a reviewer doesn't trip on it.
</risks>

<open-questions>
- Seat-loser payment model (pre-auth vs charge-then-refund) — deferred by the user; concludes at Phase 2 detailed planning. Recommendation: pre-auth (checks run before the mock charge, the loser is never charged, no refund states).
- Roster endpoint auth: assumed session-gated like everything else (the earlier "no auth" assumption was superseded by the user's auth correction).
</open-questions>
