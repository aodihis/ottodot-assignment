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

These are recorded because they are the honest picture. Several came from me rather than
from the AI, and the AI had to be corrected rather than the other way round.

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

That was wasted work and it is worth naming as such. The AI verified it thoroughly
*before* asking whether it was wanted, and the question belonged in the plan rather than
after the implementation. What survived is the reasoning about the constraint, which is
that the SPA and the API meet only at the dev proxy and that this is what keeps requests
same-origin. That is why there is no CORS middleware and the cookie is `SameSite=Lax`.
The constraint is now recorded in `CLAUDE.md` for whoever deploys it.

### 6. Claims written down and never checked

The Phase 3 plan asserted that `concurrently` was in the stack table. It was not
installed and never had been, since root `devDependencies` were `@types/node` and
`typescript`. The AI had been repeating its own earlier summary as fact.

This one is an argument for the workflow rather than against it. The fix was one check,
and it was caught because the plan said "verify" for that step. It is still a warning
about how confidently a summary can become a requirement.

### 7. Fabricated APIs, wrong walkthroughs, and my own mistakes

These are smaller, but the pattern is worth recording. **All of the errors below were
mine, and were caught by the AI or by running the thing:**

- **An invented function.** The payment screen once called `bookings.holdMinutesFromNow()`,
  which did not exist and never had. Caught while writing the file, before it ran.
- **A walkthrough that would have shown the wrong error.** I wrote a README step promising
  a "not enough seats" refusal when the seeded data would actually have produced
  `DUPLICATE_ACTIVE_BOOKING`, because Alya already held a seat in that class. Fixed by
  reading the real enrolments and the check order in the service, which is
  `bookings.service.ts:217` for duplicates and `:228` for capacity.
- **A misdiagnosis, twice.** `prisma migrate` failed with `database is locked`. The AI
  blamed stdin and then invented a concurrent session. The real cause was its own
  `prisma migrate dev` process, orphaned earlier by a stop that killed the wrapper rather
  than the child. The lesson is narrow and real, which is that when a tool reports a lock
  you find the holder instead of reasoning about who might hold it.
- **`Location.addEventListener` does not exist**, because it is on `window`.
  `svelte-check` caught it, and the app would have thrown at startup.
- **A test helper that recorded the wrong thing.** Two tests asserted against `undefined`
  because the `Call` record omitted the `init` field it was tested through. Those were
  passing tests for the wrong reason, caught by running them.

### 8. Where the AI was right and I changed my mind

For balance: the red-team pass over the booking design found 13 real findings in Phase 2
and all were accepted, including that the losing side of a race should carry the *failed*
charge in its response, so that "you were not charged" is visible rather than asserted.
The AI also correctly insisted the seat claim happen *after* the order is claimed, so
nothing is taken for a booking somebody else already paid for. That ordering is the
difference between a race that resolves and one that double-books.

## What I would change about the workflow next time

1. **Fix the environment first.** Two rounds were lost to assumptions that cost seconds to
   check. Port 5173 sits inside a Windows reserved range, which
   `netsh interface ipv4 show excludedportrange protocol=tcp` shows because Hyper-V held
   5085 to 5184 on this machine, and Vite 8 needs Node `^20.19`, which is tighter than the
   "Node 20+" in the notes. Pinning the environment before step one would have caught both.
2. **Ask for the deployment shape in the plan.** The one-port serving was built, verified
   and thrown away. "How does this ship?" is one question with a large blast radius, and it
   belongs with "what are we building" rather than after it.
3. **Make the seed prove its claims the moment a document makes them.** The guard that
   fails unless the four demo cases exist should have been written when the README first
   claimed them. Documentation that nothing checks drifts.
4. **Do not run two agents on one working tree.** A parallel session caused 25 unrelated
   tests to fail with `403`, because both runs rebuilt the shared `test.db`, and an
   unrelated commit absorbed a whole phase's API work because it was sitting uncommitted
   in the same tree. One writer per repository is a real constraint rather than a
   preference.
5. **Show a thin slice sooner.** The first version of the booking flow put booking,
   payment and status on one scrolling page. That was a defensible reading of "two views,
   no router", and it was wrong. The fix came only after I saw it. A demo of the flow
   before the styling would have surfaced the preference earlier.
6. **Have the AI mark its own uncertainty.** Several wrong claims were stated with full
   confidence and no signal that they were recall rather than verification. The workable
   rule is the one in `CLAUDE.md`, which is to read the file or run the command, and
   otherwise say what is unknown.

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
