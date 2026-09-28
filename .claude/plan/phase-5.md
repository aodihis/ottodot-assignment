# Plan — Phase 5: API documentation (Zod OpenAPI + Scalar)

Status: done
Iteration: 5

<shared-context>
<!-- Restated in every plan file so context survives across phases. -->

## Assignment (source of truth)

Build the smallest working slice of a **trial-class booking** system: a parent books a trial class for a child and pays (mock), the booking status is shown, and the team can see the roster; 4 confirmed seats per class. Must prevent or handle duplicate confirmed bookings, overbooking, payment failure not joining the roster, and the required **last-seat race**.

## User stories

| # | Story | Status |
|---|-------|--------|
| 1 | As a developer/reviewer, I can reset+seed demo data in one command | done (Phase 1) |
| 2 | As a parent or admin, I can log in, so the API is session-gated | done (Phase 1) |
| 3 | As a parent, I can see my children and trial classes with seats remaining | done (Phase 1–2) |
| 4 | As a parent, I can book a trial class and see the booking status | done (Phase 2) |
| 5 | As a parent, I can mock-pay; on failure my child is not on the roster and I can retry | done (Phase 2) |
| 6 | As a parent competing for the last seat, only the first successful payment confirms | done (Phase 2) |
| 7 | As an admin, I can list classes and view each class's confirmed roster | done (Phase 2) |
| 8 | As a reviewer, I can run a test suite proving all invariants | done (131 tests) |
| 9 | As a visitor, I can register with my email and password | done (Phase 1) |
| 10 | As a parent, I can add and remove my own children | done (Phase 1) |
| 11 | As a parent, I can cancel a confirmed booking before the cutoff and receive a mock refund | done (Phase 2) |
| 12 | As a parent, my selection is held for a limited time, and released when it lapses | done (Phase 2) |
| 13 | As a reviewer, I can read the whole API — every endpoint, request, and response shape — in a browsable reference at `/scalar` | **this phase** |

## Stack (concluded 2026-09-28)

TypeScript (Node 20+) · Hono + `@hono/node-server` · Prisma 7 + SQLite via the better-sqlite3 driver adapter · zod · hono/jwt session cookie + hash-wasm argon2id · Svelte 5 + Vite SPA · Vitest · tsx / npm workspaces / concurrently.
**Added this phase:** `@hono/zod-openapi` (route definitions that *are* the OpenAPI document) · `@scalar/hono-api-reference` (renders that document).

## Decisions so far

- 2026-09-28 — Stack concluded (see above).
- 2026-09-28 — Soft holds; availability = `capacity − confirmedCount`; resolution at payment.
- 2026-09-28 — Authoritative capacity guard = conditional atomic `updateMany` inside the confirm transaction.
- 2026-09-28 — A booking is an order with line items (`Booking` + `BookingItem`); a paid line writes an `Enrollment`.
- 2026-09-28 — Pay is a conditional status transition (idempotent double-pay; 409 `BOOKING_NOT_PAYABLE`).
- 2026-09-28 — Money is a `Decimal` at 2 dp exposed as a JSON number, not integer cents.
- 2026-09-28 — Payment is mock: success derived from the card number. Charge decided before the seat guard.
- 2026-09-28 — Everything is UTC in and out; datetimes are ISO strings with a `Z`.
- 2026-09-28 — Registration is public; children are soft-deleted.
- **2026-09-28 (this phase)** — Adopt `@hono/zod-openapi` rather than hand-writing a spec file. Route definitions become the single source of both validation and documentation, so the reference cannot drift from the code the way a separate `openapi.yaml` does. `@hono/zod-openapi@1.6.3` peers on `zod ^4.0.0` / `hono >=4.10.0`; this repo has zod `^4.6.5` and hono `^4.13.9` — compatible.
- **2026-09-28 (this phase)** — The module sub-apps (`createXxxRoutes(db)`) keep their paths and names, and simply return `OpenAPIHono`. `OpenAPIHono.route()` merges a mounted sub-app's route definitions into the parent registry, so the folder structure is untouched and `createApp(db)` still composes them the same way.
</shared-context>

<phase-plan>
## Goal

Serve a browsable API reference at `/scalar`, backed by an OpenAPI document at `/doc` generated from the route definitions themselves. Every existing endpoint keeps its current URL, request shape, response envelope, and status codes — this phase adds documentation, it does not change behaviour. The route files stay where they are.
</phase-plan>

## Contract

New endpoints, both unauthenticated (they sit outside the `/api/*` gate):

| Method | Path | Returns |
|---|---|---|
| `GET` | `/doc` | the OpenAPI 3.0 document as JSON |
| `GET` | `/scalar` | the Scalar HTML reference, pointed at `/doc` |

No existing endpoint's URL, method, request body, response envelope, or status code changes.

## Steps

1. **Dependencies** — add `@hono/zod-openapi@^1.6.3` and `@scalar/hono-api-reference@^0.12.6` to `api/package.json`.
   *Verify:* `npm install` succeeds; `npm ls zod hono` shows no peer warnings.

2. **New `helpers/openapi.ts`** — `ErrorResponseSchema` (the `{message, error:{code, details?}}` component), `errorResponse()`, `successResponse()`, `jsonBody()`, `IdParamSchema`. Deliberately a new file rather than an addition to `helpers/http.ts`: `http.ts` builds the bodies, this describes them. `z` is imported from `@hono/zod-openapi`, not `zod`, so `.openapi()` is guaranteed to be patched onto the prototype rather than depending on import order.
   *Verify:* `npm run typecheck`.

3. **Shared view schemas in `classes.view.ts`** — `ClassSummarySchema` / `ClassViewSchema` next to the view functions that produce them, because the students module serves the same class payload. Same reason the view functions live there.
   *Verify:* `npm run typecheck`; drift between `classView()` and its schema is caught by step 5's response typing.

4. **Convert the four route modules** — `auth`, `students`, `bookings`, `classes` become `OpenAPIHono` with `createRoute` + `app.openapi(route, handler)`. Handlers read `c.req.valid('json')` instead of `schema.parse(await c.req.json())`; the schemas themselves are unchanged. Bodies and responses are declared so the reference shows real shapes; auth-required routes carry `security: [{ session: [] }]`.
   *Verify:* `npm test` — the existing 131 tests must pass untouched. This is the phase's real gate.

5. **`app.ts`** — build on `OpenAPIHono` with `defaultHook: (result) => { if (!result.success) throw result.error }`, so a validation failure still surfaces as `ZodError` → the existing 422 `VALIDATION_ERROR` branch. Register the `session` security scheme component. Mount `app.doc('/doc', …)` and `Scalar({ url: '/doc' })` at `/scalar`, outside the gate.
   *Verify:* `npm test`; then `npm run dev` and load `http://localhost:3000/scalar`.

6. **Preserve the malformed-JSON answer.** Hono 4.13.9's request `validator` parses the body itself and throws `HTTPException(400, 'Malformed JSON in request body')` on a body that is not JSON — it no longer reaches `app.onError` as the `SyntaxError` the current code caught, so the old branch is replaced rather than extended. `@hono/zod-openapi` additionally refuses a body whose content type is not JSON with `HTTPException(415)`.
   *Verify:* `envelope.test.ts` asserts the 400/`MALFORMED_JSON` case; a new case added there covers the 415.

7. **Coverage test** — a new `tests/integration/docs.test.ts`: `/doc` answers 200 with a document whose `paths` contain **every** route the app mounts (the same "one guard over every mounted route" idea as `envelope.test.ts`), and `/scalar` answers 200 HTML referencing `/doc`. A route added without docs fails this test.
   *Verify:* `npm test`.

8. **Document the commands** — `/doc` and `/scalar` in `CLAUDE.md`'s `<commands>` and in the README's endpoint section (Phase 4).
   *Verify:* re-read both against the running app.

## Out of scope

- Authentication on `/scalar` — the reference is public, like the Hono example. Noted as an open question below.
- `@scalar/openapi-to-markdown` (the LLM-facing Markdown endpoint) — the example offers it, but nothing here consumes it yet.
- Changing any endpoint's behaviour to make it "document better". The spec describes the API; it does not get to redesign it.
- A generated TypeScript client for the Svelte app.

<feedback>
- **The conversion is worth more than the reference.** Declaring each response schema makes `@hono/zod-openapi` type-check every handler's return against it, so a service that starts returning a new field — or stops returning an old one — fails `npm run typecheck` at the route instead of silently drifting. That check is the reason to convert the routes rather than hand-write a spec next to them, and it is worth the larger diff.
- **Import `z` from `@hono/zod-openapi`, not `zod`.** Both are the same zod instance, but the package's re-export is guaranteed to have had `extendZodWithOpenApi` applied. Importing from `zod` works only by load-order luck.
- **Steps 4 and 6 are one change, not two.** Splitting them would leave a commit where malformed JSON answers 500.
</feedback>

<risks>
- **The 131 existing tests are the blast radius.** Moving body parsing into middleware changes *when* a body is validated, and the error envelope is asserted end-to-end. Mitigation: `defaultHook` rethrows the `ZodError` so the existing 422 branch is unchanged; step 6 keeps the 400 path; step 4's verify is the full suite, not a sample.
- **A caller that omits `Content-Type: application/json` changes answer** — 415 `UNSUPPORTED_MEDIA_TYPE` where the old `c.req.json()` gave 400 `MALFORMED_JSON`. (Predicted as a 422 validating `{}` during planning; the package refuses the media type before it validates. The 415 is the better answer.) Covered by a new test.
- **`c.json()` needs its status spelled out, `200` included.** Omitting it makes the return type widen to every status the route declares, and the handler stops type-checking. Cost an hour of the implementation; now a rule in `CLAUDE.md`.
- **Response schemas drifting from what services return.** This is the failure mode the phase is meant to *catch*, and the handler return type-check converts it into a compile error. Where a schema and a view genuinely disagree, fix the schema.
- **Writing 15 response schemas is the bulk of the work.** Mitigation: the shared envelope and class-view schemas are defined once; endpoint schemas are short and mechanical.
- **`/scalar` loading its renderer from a CDN** means the page needs network access to render. Out of scope to vendor it; noted in the README as a demo-only property.
</risks>

<review>
## Review outcomes (2026-09-28)

`/simplify` (four angles) and `/security-review` were run before the commit, per CLAUDE.md.

**Fixed:**

- **Six hand-written string unions replaced with the generated Prisma enums.** `z.enum(['pending_payment', …])`, `['charge','refund']`, `['succeeded','failed']`, `['card']`, `['expired', …]` and `['parent','admin']` restated `BookingStatus`/`PaymentType`/`PaymentStatus`/`PaymentMethod`/`CancelledReason`/`Role` value-for-value from `generated/prisma/enums.ts`. They are now `z.enum(Role)` and friends, so a Prisma enum change reaches the contract instead of silently missing it.
- **`CardBrand` stopped being enumerated a third time.** `helpers/payments.ts` now exports `CARD_BRANDS` as a tuple, and both the `CardBrand` type and the request/response schema derive from it.
- **`{id, name}` child schema was declared twice** — in `auth.routes.ts` (as `studentRefSchema`) and `students.routes.ts` (as `studentViewSchema`), under two names implying a distinction that did not exist. Now one `StudentRefSchema` in `helpers/students.ts`, where CLAUDE.md puts cross-module shapes.

**Kept deliberately (flagged by a reviewer, declined):**

- **The repeated `401`/`403` pairs across routes.** The descriptions genuinely differ per route (`'The email or password is wrong'`, `'Admin only'`, `'That child belongs to another parent'`), and the pair co-occurs on only some routes. A shared `authErrors()` spread would be wrong for most of them and would hide the per-route contract that is the whole point of `createRoute`.
- **Response schemas living in `routes.ts` rather than a `bookings.view.ts` beside the view functions.** `classes.view.ts` exists because *two* modules serve the class payload; `bookingView` and `classRoster` each have one consumer, so a `.view.ts` per module would be a file for its own sake. Drift is already caught by the compiler at the handler return.
- **The duplicated `CLASS_ALREADY_STARTED` arm in the pay and cancel switches.** Two call sites, trivial body — not worth a helper.

**`/security-review` — no HIGH or MEDIUM findings.** The three areas with real exploit potential were verified by execution rather than by reading:

- **The new `GET /api/bookings` tenancy scope.** The risk was that the wildcard gate `app.use('/bookings/*', requireParent(db))` might not match the bare `/bookings`, leaving `parentId` undefined — and Prisma drops an `undefined` filter, which would have returned *every* parent's bookings. It does not: Hono's `/x/*` matches `/x`, and the 401 assertion plus the cross-parent list test both pin it.
- **The validation swap.** `defaultHook` throws on failure and `onError` renders the same 422 envelope; `#resolveDefaultHook()` walks the parent chain so the mounted sub-apps inherit it; and `@hono/zod-openapi` adds a media-type gate that makes the new path *stricter* than `c.req.json()` (a non-JSON content type is now a 415 instead of a loose parse).
- **The docs gate.** Fails closed; unset, empty and misspelled values all hide the reference. The Scalar page takes a literal config and no request data reaches the renderer — the residual is the CDN script, reachable only in dev/test.

One real defect it caught, now fixed: `.env.example` still described the *old* fail-open behaviour ("leaving it unset serves them") after the gate was changed to an allowlist. The code was right; the prose was wrong and would have misled the next reader.

**Open, not fixed here:**

- **`ErrorResponseSchema` is never checked against `errorBody`'s output.** The success path is type-checked at every handler; the error envelope is only thrown, so nothing coupled the two. `api/tests/unit/openapi.test.ts` now asserts they agree, which closes the gap without moving the schema. (One reviewer proposed co-locating the schema with `errorBody` in `http.ts` instead; the other called the build-vs-describe split justified. The test addresses the actual risk — drift — either way.)
- **The `expiredHoldWhere` class-started branch is unindexed.** It filters through `items.some.trialClass.startsAt`, which `@@index([status, expiresAt])` cannot serve, so that half of the sweep predicate scans items. Belongs to the booking-list work, not this phase.
- **`listBookings` sweeps on the read path.** Deliberate and documented (the sweep is idempotent and `npm run sweep` exists for cron), but `GET /api/bookings` does pay a transaction per call.

</review>

<open-questions>
- ~~Should `/scalar` and `/doc` be gated?~~ **Decided (2026-09-28): unmounted unless `NODE_ENV` is `development` or `test`** — the paths are not routed at all, so they answer the same 404 as any unknown path rather than a 403 that confirms a reference exists. `docsEnabled()` in `helpers/config.ts` reads the variable at call time. It **fails closed** (an allowlist, not a `!== 'production'` deny-list): a reviewer pointed out that a default-on disclosure surface is the wrong posture for an endpoint that publishes every route, payload and the session scheme — the same reasoning `sessionSecret()` in that file already follows. An unset or misspelled `NODE_ENV` now hides the docs rather than publishing them, so `NODE_ENV=development` is required locally (it is in `.env.example`, and `vitest.config.ts` sets `test` explicitly).
- Should the reference be pinned to a Scalar version instead of `latest`? Pinning makes the demo reproducible and immune to an upstream break; the default in the middleware tracks newest.
</open-questions>
