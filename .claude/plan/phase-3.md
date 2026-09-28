# Plan — Phase 3: Minimal Svelte SPA

Status: draft
Iteration: 3

<shared-context>
<!-- Restated in every plan file so context survives across phases. -->

## Assignment (source of truth)

Build the smallest working slice of a **trial-class booking** system. A parent picks a child and an available trial class, submits a booking, passes a mock payment step, and sees the booking status. An admin/teacher can see the class roster. Trial classes cap at **4 confirmed** students. Must prevent or handle: duplicate confirmed bookings, overbooking past 4, payment failure that must not add the child to the roster, and the required **last-seat race**. Regular enrollment is out of scope. A polished frontend is explicitly not required — the data model, backend logic, invariants, tests, and explanation matter more.

Deliverables: public GitHub repo with README.md, implementation, seed data, tests, AI_USAGE.md, plus a short video walkthrough.

## User stories

| # | Story | Status |
|---|-------|--------|
| 1 | As a developer/reviewer, I can reset+seed demo data in one command, so the demo runs in minutes | planned (Phase 1) |
| 2 | As a parent or admin, I can log in with a seeded account, so the API is session-gated | planned (Phase 1) |
| 3 | As a parent, I can see my children and trial classes with seats remaining | planned (Phase 1 API, Phase 3 UI) |
| 4 | As a parent, I can book a trial class for my child and see the booking status after submission | done (Phase 2 API; Phase 3 UI) |
| 5 | As a parent, I can mock-pay; on failure my child is not on the roster and I can retry | done (Phase 2 API; Phase 3 UI) |
| 6 | As a parent competing for the last seat, only the first successful payment confirms; the loser is clearly told and not charged | done (Phase 2 API; Phase 3 UI) |
| 7 | As an admin, I can list classes and view each class's confirmed roster | done (Phase 2 API; Phase 3 UI) |
| 8 | As a reviewer, I can run a test suite proving all invariants | done (128 tests; presented in Phase 4) |
| 9 | As a visitor, I can register with my email and password, so I can use the app without a seeded account | planned (Phase 1 API, Phase 3 UI) |
| 10 | As a parent, I can add and remove my own children | planned (Phase 1 API, Phase 3 UI) |
| 11 | As a parent, I can cancel a confirmed booking before the cancellation cutoff and receive a mock refund | done (Phase 2 API; Phase 3 UI) |

## Stack (concluded 2026-09-28)

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript (Node 20+) | one language across API/web/tests |
| API | Hono + @hono/node-server | lightweight; `app.request()` enables tests without a listening server |
| ORM/DB | Prisma 7 + SQLite through the better-sqlite3 driver adapter | user's choice; zero-infra DB |
| Validation | zod | boundary validation; closed vocabularies are Prisma enums |
| Auth | hono/jwt signed httpOnly cookie + **hash-wasm** (`argon2id`, pure WASM) | session-gated API; zero native binaries — installs on any OS/arch |
| Frontend | **Svelte 5 + Vite SPA** | user's choice; SPA, no SSR; **no router library** — two views in one page |
| Tests | Vitest | TS-native, per-file SQLite db |
| Tooling | tsx, npm workspaces, concurrently | monorepo: `api/` (with its own tests), `web/` |

## Decisions so far

- 2026-09-28 — Stack concluded: Hono + Prisma 7 + SQLite + Svelte 5 SPA.
- 2026-09-28 — SPA, not SSR: Hono serves the built `web/dist` in prod; Vite proxies `/api` in dev. No router library — view switching by app state (parent flow vs admin roster).
- 2026-09-28 — Soft holds + confirm-time capacity guard (`confirmedCount` conditional update) + the single-synchronous-connection serialization the better-sqlite3 adapter gives + partial unique index backstop; see `phase-1.md` for the full decision list.
- 2026-09-28 — Auth in Phase 1 (seeded accounts, session cookie, parent-scoped bookings, `role=admin` gate).
- 2026-09-28 — Frontend stays a plain, unstyled-or-lightly-styled SPA: the assignment explicitly does not reward polish.
</shared-context>

<phase-plan>
## Goal

A working browser flow a reviewer (and the video) can walk: log in, pick a child, pick a class, book, pay, see the status — plus an admin view showing rosters. This phase is the demo surface, not a product.

## Steps (simple breakdown — detailed planning happens at this phase's iteration start)

1. Scaffold `web/` (Vite + Svelte 5), workspace wiring, dev proxy to the API.
2. Auth views: login and register (seeded accounts listed on screen, cookie via `fetch` with `credentials: 'include'`) and session bootstrapping (`GET /api/auth/me` on load).
3. Parent flow: children (add / remove) → class list with `seatsAvailable`, `pendingHolds` and `cancellationDeadline` → book → mock pay (**good card / declining card**, not success/failure buttons — the outcome is derived from the card number) → booking status with `canCancel` and a cancel-for-refund action, including the friendly failure states from the 409s (`SEAT_TAKEN`, `DUPLICATE_ACTIVE_BOOKING`, `CANCELLATION_WINDOW_CLOSED`, …). While a hold runs, watch `expiresAt`; `canCancel` is the server's answer, so the UI does not re-derive it. **Refetch the class list after a cancel** — a released seat raises `seatsAvailable` with no purchase behind it.
4. Admin view: class list + per-class roster (`roster`, `pendingHolds`, and `refunded` — keyed `refunded` because only a refunded cancellation leaves a row, so refunded students don't simply vanish).
5. Prod path: Hono serves `web/dist` so one command runs the whole demo.

## Out of scope (this phase)

- Visual polish, animations, responsive design, accessibility hardening, component library, state management library, routing library, SSR, E2E browser automation in CI.
</phase-plan>

<feedback>
<!-- Where the plan disagrees with the original request: better ideas, with explanations. -->

- Two views in one page rather than a router library: the assignment has exactly two screens and explicitly de-prioritizes frontend polish. A router would be pure ceremony.
- The UI is deliberately a thin shell over the API contract: it performs **no** authoritative checks. Every guard lives in the backend/DB, and the README states this split explicitly, since the assignment asks which checks belong where.
</feedback>

<risks>
- Cookie/session handling across the Vite dev proxy is the most likely snag (same-origin assumptions, `credentials: 'include'`, proxy cookie rewriting). Mitigation: proxy `/api` through Vite so everything is same-origin, and verify login manually before building the rest.
- Scope creep into polish. Mitigation: steps above are the whole phase; anything visual beyond functional is out of scope.
</risks>

<open-questions>
- Whether the video demo uses two browser windows for the race (recommended: yes — it makes the last-seat scenario visible) or the test output alone.
</open-questions>
