# AI usage

How this was built with AI, where the AI was wrong, and how the result was verified.
Written to be useful rather than flattering, so the corrections get the most space.

## Which tools

**Claude Code** (Anthropic's CLI) as the only AI tool, driving the whole build.

## What AI was used for

- **Planning.** Breaking the brief into five phases with user stories, then a detailed
  plan per phase. Contract first, data model first, then the file-level steps and how
  each would be verified.
- **Implementation.** The Prisma schema, the hand-written migrations including the
  constraints Prisma cannot express, the services and routes, the Svelte SPA, and the
  stylesheet.
- **Tests.** 214 of them, including the ones that specifically try to break the
  invariants, such as two payments racing for the last seat, an over-capacity update,
  and a duplicate registration.
- **Review.** A red-team pass over the booking design in Phase 2, which produced 13
  findings that were all accepted, and the repo's `/simplify` and `/security-review` on
  Phases 1, 2 and 5.
- **Documentation.** These files, and the commit messages.

## One place AI clearly moved faster

**Writing code and implementing the logic.** Not the planning and not the review, but the
part in the middle, where a decision has to become working code.

There are four reasons, and all four are friction I would otherwise pay for myself.

**Reading the documentation.** Using a library normally means finding the right API, the
right option and the right idiom before writing a line. The AI usually already knows it,
so that stops being a prerequisite rather than a step. You still check the result, but you
no longer have to read your way to it. The Svelte test harness is the clearest example.
Vitest resolves Svelte's *server* build unless `resolve.conditions: ['browser']` is set,
and without that line `mount()` throws an error that names nothing relevant. That is a
15-minute dead end if you have to find it in the documentation, and a one-line fix if you
already know it.

**Hesitation.** When I implement logic I hold several scenarios in my head at once, and
choosing between them is a real cost. The AI does not hesitate. It picks a path, writes
it, and moves on. That is faster, and it is also why the review matters more rather than
less, because a confident wrong choice looks exactly like a confident right one.

**Naming.** Naming variables and functions blocks me more often than it should. The AI
produces a name and carries on.

**Reading a large codebase.** Following one function that calls into several files takes me
time, mostly to work out which files are even involved. The AI does that quickly, and can
write the explanation down as it goes. That is why the comments in this repo describe
intent rather than restating the code.

The result is a shift rather than a straight saving. What is left for me is reading the
generated code and judging it, so judgement moves to the two ends of the work. It goes
into the plan, where the approach is agreed before anything is written, and into the
review, where the result is checked. The middle is where the time goes away.

The best illustration here is the OpenAPI conversion, because it needed all four. Fifteen
response schemas across four route modules is mechanical, high-volume work with little
judgement in it. It required knowing the library, it touched four files that had to be
read, and it involved a great many small naming and shape decisions. One pass produced the
browsable reference at `/scalar`, the document at `/doc`, and a new class of compile-time
error, because declaring the responses made the compiler check them.

## Where I disagreed with, corrected, or rejected AI output

These are recorded because they are the honest picture. Every one of them is a case where
I rejected or overruled the AI, and the AI was the thing that had to change.

### 1. The booking design, where `BookingGroup` was rejected for order and line items

This is the most consequential one and the one I would point at first.

**AI proposed** `BookingGroup` for the record that holds one payment, one timer and
several children's seats, and defended it as more precise than "booking", since a booking
already meant one child's seat.

**I rejected it** in the planning session: *"DOn't make the name booking group just
booking for endpoint, it easier for user to understand"*, and asked for the commerce
pattern instead, meaning **`Booking` plus `BookingItem`**.

The naming was not the point, and the AI was wrong in a way that mattered. Once the model
was an *order with line items*, whole rules stopped being rules I had to remember and
became consequences:

- all-or-nothing is what an order *is*, so nothing per-child needed its own status
- one payment per order is natural, so `Payment` hangs off `Booking`
- the group race, two children against one seat left, is just an order that does not fit
- a refund is `amount × cancelled lines`, which is arithmetic rather than policy

It also removed a class of bug outright. `BookingItem` originally carried its own
`status`, mirroring the order's. That mirror had **six** write sites across pay, cancel
and sweep, and no invariant keeping it honest, so it was deleted. The order carries the
state and the line records what was bought.

**The lesson:** when AI reaches for a precise invented name, the model underneath is
often the thing to question. "BookingGroup" was a compound built to describe a record the
AI had already designed wrongly.

### 2. Money, where integer cents were rejected for decimals

**AI designed** `priceCents` and `amountCents` integers. That is the standard advice, and
it is defensible.

**I rejected it:** *"for the prices, don't add cents, just price, amount, refundAmount,
and make it decimal, I feel it is easier for debugging later, and the price won't have a
very small cents amount, and limit it to two decimal points."*

The reasoning is about who reads the data. I debug by reading values in a SQLite client,
where `50.00` is legible and `5000` needs mental arithmetic, and this product has no
sub-cent prices. The migration had to convert every money column with `/ 100.0`, which is
a real cost paid once.

One thing the AI was right to flag afterwards, and I would have missed, is that JSON
numbers drop trailing zeros, so `50.00` reaches the client as `50`. The API is honest
about that rather than pretending the format survives the boundary.

### 3. Datetimes, where local time was rejected for always-UTC

**I corrected** the AI's default here before it could ship: *"the datetime should always
be in utc 0, regarless the server timezone. so probably you need a helper to save the
datetime. if needed."*

The AI's follow-up was the useful part. It pointed out where the risk actually lives,
which is not in the column type, since that stores an absolute instant regardless, but in
*parsing*, where `new Date('2026-10-06 10:00')` is silently interpreted as local time. So
the helper rejects offset-less strings rather than accepting them, and the tests assert
that responses carry a `Z`.

### 4. The roster, where deriving it from booking items was rejected for an explicit `Enrollment`

**AI's first design** derived a class's roster from confirmed booking-item rows. That is a
commercial fact about an order, filtered by a status predicate, and backed by a partial
unique index `WHERE status = 'confirmed'`.

**I corrected it.** A student should relate to a class directly, written when the booking
completes, so that "which classes is this child registered for?" is answerable.

The change replaced a predicate with a plain `UNIQUE(studentId, classId)` and made the
duplicate guarantee *stronger*, because it no longer depends on a status value being
correct. It also deleted six mirror writes and the partial index that had to be
painstakingly re-appended in a later migration. I would not have found this by reading
the code. It came from asking what the product needs to know.

### 5. One-port serving, which was built, verified and then rejected

**AI designed and built** the API serving the built SPA itself, so one command ran the
whole demo. It worked. `/`, the assets and an SPA fallback were all verified running
against the real build, and the API routes correctly kept winning.

**I rejected the deployment shape:** *"in production, I don't want do that, we will do in
different container probably."* It was removed, along with the four lines that mounted it
and the `npm start` script.

## What I would change about the workflow next time

1. **Plan with examples, not only prose.** A plan that shows the shape of the thing, a
   sample payload or a sketch of a screen, gets followed far more accurately than one that
   describes it in words. The difference is visible in this repo. Where the plans carried
   a concrete shape, which is the contract tables in Phases 1 and 2, the implementation
   matched them with little back and forth. Where they carried a description, which is
   most of Phase 3, the intent had to be rediscovered during the work.
2. **Choose the libraries first, and spend longer on the plan.** Stack decisions here were
   settled early but not exhaustively, and some were still moving while code was being
   written. The OpenAPI layer arrived a phase after the routes it rewrote, which meant
   converting four route modules rather than writing them that way once. Picking the
   libraries up front lets the plans assume the right primitives. The honest constraint is
   time. With a limited window, planning depth is the first thing to get squeezed, and it
   is the wrong thing to economise on, because everything after it inherits the mistake.
3. **Use subagents where the work is genuinely independent.** Several parts of this did not
   need to be sequential. The API contract could have been pinned while the SPA shell was
   scaffolded, and the stylesheet written while the last of the tests were. Done properly
   it would compress the calendar time, and that is the axis a limited window actually
   constrains. One constraint learned the hard way: **one writer per repository**. Two
   agents on this working tree caused 25 unrelated tests to fail with `403`, because both
   runs rebuilt the shared `test.db`, and an uncommitted phase was absorbed into an
   unrelated commit. Parallel agents want isolated worktrees, or at least disjoint files.
4. **Triage into smaller tasks.** A phase here was sometimes a day's worth of work planned
   as one unit, which makes a wrong plan expensive, because the mistake is discovered late
   and the rework is large. Smaller tasks mean smaller plans, and a wrong plan costs less.
5. **Write the scope properly, and gate quality on a number.** The scope that existed was a
   brief rather than a specification, and quality was judged by review rather than
   measured. Adding coverage tooling with a threshold, for which Vitest's v8 provider is
   the right instrument here (the equivalent of `llvm-cov` for a JavaScript project), and
   using AI to close the remaining gap, would make "tested" a figure of at least 80 percent
   rather than an impression. The same applies to a lint and format gate, which this repo
   notes as not yet configured.

## How I verified the final implementation

Nothing below is "the AI said so". Every line is a command that was run or a query that
returned a result.

**The suite.** 214 tests, split between 157 against the API in 19 files and 57 against the
SPA in 12 files. `npm test` runs both. The API tests run against a real SQLite database
rebuilt from the migrations on every run, so the migrations are exercised rather than
assumed.

**Types and build.** `npm run typecheck` runs both `tsc --noEmit` for the API and
`svelte-check` for the components, which reports 325 files with 0 errors. `npm run build`
succeeds.

**The schema is where it claims to be.** `prisma migrate diff --from-migrations ...
--to-schema ...` reports **"No difference detected"**. That is what proves the
hand-written SQL still produces exactly the schema Prisma expects, including the `CHECK`
constraint Prisma does not model and the indexes added by hand.

**The constraints were proved by making them bite** rather than by reading them. A raw
`UPDATE` pushing `confirmedCount` past `capacity` is rejected by the `CHECK`, and a raw
duplicate `Enrollment` insert throws `UNIQUE constraint failed`. A constraint nobody has
tried to violate is a constraint nobody knows works.

**The new index is load-bearing.** `EXPLAIN QUERY PLAN` on the parent booking list returns
`SEARCH Booking USING INDEX Booking_parentId_createdAt_idx (parentId=?)` rather than a
scan.

**The invariants hold after every mutating test.** `expectSeatCountsConsistent` asserts
that `confirmedCount == COUNT(enrollments)` and that `0 ≤ confirmedCount ≤ capacity`, so
the counter and the roster cannot drift apart unnoticed. The last-seat race is looped five
times with exactly one winner each run, and the loser is verified to be fully cancelled,
carrying a *failed* charge and no refund.

**The demo runs end to end over the real API**, using the same calls the SPA makes and
against a *copy* of the development database so the seeded data stayed untouched. Login,
then `/auth/me`, then classes, then book one class for two children (a hold is created
with 900 seconds and nothing is charged), then pay with `4242...` and the booking confirms
with the card read as `visa ....4242`, then the seats go from 4 to 2, then
`GET /bookings` returns six orders newest first with the new one on top, then as admin the
roster shows both children, then cancel and it is `cancelled` with reason
`parent_cancelled` and a refund of 100, then the seats go from 2 back to 4, and the roster
is empty while both children appear under refunds.

**The cookie survives the dev proxy.** The login response sets a session cookie marked
`HttpOnly` and `SameSite=Lax` with a 7-day max age, and the following calls carry it.
That is the thing that would have broken quietly if same-origin had not held.

**The seed proves itself.** `npm run seed` counts the four cases the README promises and
throws if one is missing, reporting "4 class(es) with seats, 1 at exactly 3/4, 8
enrollment(s), 1 failed payment(s)." The check is a pure function with its own unit tests,
because the seed's module writes to the database as soon as it loads and could not
otherwise be imported by a test.

**What I did not verify, and would not claim:**

- **The visuals.** There is no browser automation available here, so the interface is
  verified by its 57 component tests and by the dev server serving every module, not by
  looking at it. The visual check was done by hand.
- **The last-seat race as an experience.** It is proved at the API level, where the
  invariant lives. Nobody has automated two real browsers racing.
- **Load.** There is no concurrency testing beyond the five-run race loop and no
  profiling. The single-connection serialisation argument is a design property rather than
  a measurement.
- **A real deployment.** Two `.env.example` files and a note about the cookie and CORS
  constraint are the whole of it.
- **`/simplify` and `/security-review` on the frontend phase.** Phases 1, 2 and 5 were
  reviewed with both. I waived them for the Svelte work, and the commit says so rather
  than implying otherwise.
