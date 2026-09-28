# Plan — Phase 3: Minimal Svelte SPA

Status: done (2026-09-28), with one environment item outstanding — see below
Iteration: 3

<shared-context>
<!-- Restated in every plan file so context survives across phases. -->

## Assignment (source of truth)

Build the smallest working slice of a **trial-class booking** system. A parent picks a child and an available trial class, submits a booking, passes a mock payment step, and sees the booking status. An admin/teacher can see the class roster. Trial classes cap at **4 confirmed** students. Must prevent or handle: duplicate confirmed bookings, overbooking past 4, payment failure that must not add the child to the roster, and the required **last-seat race**. Regular enrollment is out of scope. A polished frontend is explicitly not required — the data model, backend logic, invariants, tests, and explanation matter more.

Deliverables: public GitHub repo with README.md, implementation, seed data, tests, AI_USAGE.md, plus a short video walkthrough.

## User stories

| # | Story | Status |
|---|-------|--------|
| 1 | As a developer/reviewer, I can reset+seed demo data in one command, so the demo runs in minutes | done (Phase 1) |
| 2 | As a parent or admin, I can log in with a seeded account, so the API is session-gated | done (Phase 1 API; Phase 3 UI) |
| 3 | As a parent, I can see my children and trial classes with seats remaining | done (Phase 1 API; Phase 3 UI) |
| 4 | As a parent, I can book a trial class for my child and see the booking status after submission | done (Phase 2 API; Phase 3 UI) |
| 5 | As a parent, I can mock-pay; on failure my child is not on the roster and I can retry | done (Phase 2 API; Phase 3 UI) |
| 6 | As a parent competing for the last seat, only the first successful payment confirms; the loser is clearly told and not charged | done (Phase 2 API; Phase 3 UI) |
| 7 | As an admin, I can list classes and view each class's confirmed roster | done (Phase 2 API; Phase 3 UI) |
| 8 | As a reviewer, I can run a test suite proving all invariants | done (Phase 2; presented in Phase 4) |
| 9 | As a visitor, I can register with my email and password, so I can use the app without a seeded account | done (Phase 1 API; Phase 3 UI) |
| 10 | As a parent, I can add and remove my own children | done (Phase 1 API; Phase 3 UI) |
| 11 | As a parent, I can cancel a confirmed booking before the cancellation cutoff and receive a mock refund | done (Phase 2 API; Phase 3 UI) |
| 12 | As a parent, my selection is held for a limited time, and released back to the class when it lapses | done (Phase 2) |

## Stack (concluded 2026-09-28)

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript (Node 20+) | one language across API/web/tests |
| API | Hono + @hono/node-server | lightweight; `app.request()` enables tests without a listening server |
| ORM/DB | Prisma 7 + SQLite through the better-sqlite3 driver adapter | user's choice; zero-infra DB |
| Validation | zod | boundary validation; closed vocabularies are Prisma enums |
| Auth | hono/jwt signed httpOnly cookie + **hash-wasm** (`argon2id`, pure WASM) | session-gated API; zero native binaries |
| Frontend | **Svelte 5 + Vite SPA** | user's choice; SPA, no SSR; **no router library** — two views in one page |
| Tests | Vitest | TS-native, per-file SQLite db |
| Tooling | tsx, npm workspaces, concurrently | monorepo: `api/` (with its own tests), `web/` |
| API docs (Phase 5) | `@hono/zod-openapi` + `@scalar/hono-api-reference` | route definitions are the OpenAPI document |

## Decisions so far

- 2026-09-28 — Stack concluded: Hono + Prisma 7 + SQLite + Svelte 5 SPA.
- 2026-09-28 — SPA, not SSR: Hono serves the built `web/dist` in prod; Vite proxies `/api` in dev. No router library.
- 2026-09-28 — Soft holds + confirm-time capacity guard + single-synchronous-connection serialization + index backstop; see `phase-1.md`.
- 2026-09-28 — Auth in Phase 1 (seeded accounts, session cookie, parent-scoped bookings, `role=admin` gate).
- 2026-09-28 — **Phase 3 (this iteration)** — The UI performs **no** authoritative checks. Every guard lives in the backend/DB; the UI renders the server's answer (`seatsAvailable`, `pendingHolds`, `canCancel`, `expiresAt`) and branches on it. The README states this split, since the assignment asks which checks belong where.
- 2026-09-28 — **Phase 3** — The user owns the stylesheet: markup, class names and `data-*` hooks only; `web/src/app.css` is handed over as a comment. Visual verification is the user's, by hand.
- 2026-09-28 — **Phase 3** — Multi-select children per booking, matching the API's `{classId, studentIds[]}`. Makes the all-or-nothing rule visible in the UI.
- 2026-09-28 — **Phase 3** — `GET /api/bookings` added (parent-scoped, newest first) with `@@index([parentId, createdAt])`. The schema comment at `schema.prisma:107` had recorded this as the next step; that comment was corrected with the index.
- 2026-09-28 — **Phase 3** — `listBookings` runs `expireHolds` before reading, so a lapsed hold is never listed as if it were still payable. This extends Phase 2's "lazy expiry, no background job" decision to the read path.
- 2026-09-28 — **Phase 3** — The video walkthrough is the user's own task, done by hand, later. Out of scope for this phase.
</shared-context>

<phase-plan>
## Goal

The demo surface: a browser flow a reviewer (and a later video) can walk — log in, pick children, pick a class, book, pay, see the status — plus an admin view showing rosters. Not a product.

## Contract (v3 — addition only)

Everything in `phase-1.md` (v1) and `phase-2.md` (v2) is unchanged. One endpoint is added:

| Method | Path | Request | Success | Errors (status CODE) |
|---|---|---|---|---|
| GET | `/api/bookings` | — | 200 `{message, bookings: [bookingView]}` newest first | 401 `UNAUTHENTICATED` · 403 `FORBIDDEN` (admin has no Parent) |

Each element is the **same `bookingView`** `GET /api/bookings/:id` returns — the list is not a summary. The route is declared as `@hono/zod-openapi` `createRoute` so it appears in `/doc`; `tests/integration/docs.test.ts` fails if a mounted route is not documented.

## Steps

1. **`GET /api/bookings`** — `listBookings` in `bookings.service.ts` (expire holds, then `parentId` equality ordered `createdAt desc, id desc`), one `app.openapi` handler in `bookings.routes.ts`, `@@index([parentId, createdAt])` + migration `20260928040000_booking_list_index`.
   *Verify:* `npm test` (149 green, incl. 5 new cases: ordering, shape identity with the single read, parent scoping, empty list, lapsed hold retired); `prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma` → "No difference detected" (exit 0); `npm run typecheck`.
   **Done.**

2. **Workspace wiring** — `web/` as a second npm workspace; `concurrently` added to the root (on Windows `&` is a *sequential* separator, so two dev servers need it); root scripts `dev`/`build`/`start`/`test`/`typecheck`.
   *Verify:* `npm install`; `curl localhost:5173/api/classes` → 401 envelope through the Vite proxy; `npm run build` → `web/dist`.

3. **Web tests** — `web/vitest.config.ts` with `resolve.conditions: ['browser']` (required: Svelte's `.` export otherwise resolves its *server* build and `mount()` throws); `tests/helpers/{render,fakeApi}.ts`; Svelte's own `mount`/`flushSync`, no testing library; `globalThis.fetch` stubbed (undici rejects relative URLs).
   *Verify:* `npm --workspace web run test`.

4. **Session + login** — `lib/api.ts` (`request()` unwrapping the envelope, typed `ApiError`), `lib/errors.ts` (code → copy + actions table), `session.svelte.ts` (`/api/auth/me` bootstraps user + parent + children in one call), `Login.svelte` with the seeded-account list and register.
   *Verify:* unit + component tests; manual login as `parent1@demo.test`.

5. **Parent flow** — children add/remove, class list, `ChildPicker`, book → pay → status, `HoldTimer`, cancel, failure states.
   *Verify:* component tests + a manual walk of the seeded data.

6. **Admin flow** — `/api/admin/classes` + roster with `roster`, `pendingHolds` and `refunded`.
   *Verify:* manual walk as `admin@demo.test`.

7. **Prod static serving** — ~~`api/src/web.ts` (`serveWeb`), called only from `index.ts` when `web/dist` exists, so no test enables file serving.~~
   **Reverted 2026-09-28, at the user's direction:** the API is a pure API and never serves the SPA. `api/src/web.ts` is deleted, `api/src/index.ts` is back to its pre-phase state, and root `npm start` is gone with it. The two halves deploy as separate containers, joined only by the dev proxy. Kept below as the record of what was built and verified, because it worked — it is simply not the wanted deployment shape.

8. **Final verification** — `npm install && npm run reset && npm test`, then walk both views: book for two children, pay with `4242…` and `…0002`, cancel and see the seat return, last-seat loser told clearly and not charged. Update `<commands>` in `CLAUDE.md`.

## Out of scope

Visual polish and all CSS (the user owns it) · router library · state-management library · component library · SSR · E2E browser automation in CI · the video walkthrough · deployment, Docker, CI.

## Verified (2026-09-28)

- **`GET /api/bookings`** — five new cases in `api/tests/integration/bookings.test.ts` (newest-first ordering with explicit instants so the ordering assertion is not a race with the clock; the list serving each booking in the byte-identical shape of `GET /api/bookings/:id`; parent scoping; an empty list rather than a 404; a lapsed hold retired before it is listed). `docs.test.ts` gained the operation and `envelope.test.ts` gained the route. `npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma` → **"No difference detected"**, so the hand-written index still matches the model.
- **The suite** — `npm test` runs both workspaces: **153 API tests (18 files) + 38 web tests (8 files), green**, with `npm run typecheck` clean (`tsc --noEmit` for the API, `svelte-check` — 316 files, 0 errors — for the web).
- **Dev proxy** — `/api/classes` through Vite answers the 401 envelope, and a real login round-trips: `POST /api/auth/login` sets `session=…; HttpOnly; SameSite=Lax`, and `/auth/me` + `/api/classes` then answer with Nadia's children and the five seeded classes. No CORS anywhere.
- **The whole demo, over the real API** (the exact calls the SPA makes, against a *copy* of `dev.db` so the seeded demo data was left untouched): login → `/auth/me` (Alya, Bima) → classes → `POST /bookings` for **both** children → `pending_payment`, amount 100, hold 900s, `canCancel` true → pay with `4242…` → **confirmed, visa ····4242** → seats **4 → 2** → `GET /bookings` returns 6 orders newest-first with ours at the top → as admin the roster shows Alya and Bima → cancel → **cancelled (parent_cancelled), refund 100** → seats **2 → 4** → roster now `confirmed: []` and `refunded: [Alya, Bima]`.
- **Prod serving** (`npm start`, API on :3999 with `web/dist` present): `/api/classes` → 401 JSON (the API wins), `/` → 200 HTML shell, `/assets/index-*.js` → 200 `text/javascript` (65 KB, the real bundle), `/some/deep/path` → 200 HTML (SPA fallback), `/api/nope` with a session → 404 JSON. **Built and verified, then removed at the user's direction** — see step 7.

### Deployment shape, and what it means for the next phase

The two halves deploy as **separate containers**; `web/dist` is static output for the web container, and the API serves nothing but `/api`. That is now recorded in `CLAUDE.md` `<scope>`.

Consequence worth carrying into any deployment work: **the session cookie is `SameSite=Lax` and the API has no CORS middleware**, because dev is same-origin through the Vite proxy. Separate origins will break both — the browser will neither send the cookie cross-site nor accept the response without CORS headers. The usual fix is a reverse proxy in front (so the browser still sees one origin); failing that it is CORS with credentials plus `SameSite=None; Secure` on the cookie. Out of scope here (Phase 4 lists deployment as out of scope), but it is the thing that will bite first.
- **Also confirmed:** a booking attempt for a child already enrolled answers `DUPLICATE_ACTIVE_BOOKING` (found by accident while verifying — the seed registers Alya in "Shapes Around Us").

### Two things worth knowing

- **`dev.db` does not have the new migration applied.** `prisma migrate status` lists `20260928040000_booking_list_index` as pending, because a dev server started outside this session holds the database and Prisma answers `database is locked`. The migration itself is verified — `test.db` is rebuilt from the migrations on every test run, and the drift check is empty. To apply: stop the process on :3000, then `npm run migrate`.
- **One test run at a time.** A concurrent `npm test` (another session was running one) deletes and rebuilds the shared `api/prisma/test.db` mid-run, which showed up as 25 unrelated tests answering 403. Recorded in `CLAUDE.md` `<commands>`.
- **Could not do the visual walkthrough**: the Chrome extension is not connected, so the SPA was verified by its 38 component tests and by driving the real API, not by looking at it. The user verifies the visuals by hand.

### Environment note for whoever runs this next

Port **5173 is inside a Windows reserved range** (Hyper-V/WinNAT excludes 5085–5184 here), so Vite's default fails with `EACCES` before it can try another port. `web/vite.config.ts` uses **4173** and binds `127.0.0.1`, with the reason in a comment. Also: Vite 8 requires Node `^20.19 || >=22.12`, which is tighter than the "Node 20+" in `<scope>` — Phase 4's README should say `>=20.19`.
</phase-plan>

<feedback>
- The UI is deliberately a thin shell over the contract. It performs no authoritative check, and the README states that split explicitly — the assignment asks which checks belong where, and "the client never decides" is the answer.
- `listBookings` sweeps before it reads. A pure read would be tidier, but it would leave a lapsed hold displayed as `pending_payment`, which is exactly the UI/server disagreement the hold timer exists to avoid. The sweep is idempotent.
- No new dependency for static serving: `@hono/node-server` already exports `./serve-static`.
</feedback>

<risks>
- **Vite 8 needs Node `^20.19 || >=22.12`**, while the recorded stack says "Node 20+". A reviewer on 20.0–20.18 would fail `npm install`. Decide: pin Vite lower, or state `>=20.19` in the README (Phase 4).
- **`mount()` under Vitest** resolves Svelte's server build without `resolve.conditions: ['browser']`. Expected first failure.
- **Cookie across the dev proxy** — keep everything same-origin by proxying `/api`; never call `localhost:3000` from the SPA; never set `Secure` or `Domain` on the cookie.
- **Two concurrent `npm test` runs clobber `test.db`.** Observed during this phase: a parallel run made 25 unrelated tests answer 403, because `globalSetup` deletes and rebuilds the shared test database. Re-run rather than debug.
- **Scope creep into styling.** Any CSS I write is rework for the user. Mitigation: `app.css` stays a comment.
</risks>

<open-questions>
- Does the web suite's count join the README's test total, or is it stated separately? Recommendation: separately.
- Should `/scalar` and `/doc` be public in the shipped demo? Phase 5 left them public deliberately; it is now gated on `NODE_ENV=production`.
</open-questions>
