# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

<scope>
- Stack (concluded 2026-09-28, recorded per phase in `.claude/plan/*.md`): TypeScript on Node 20+ · Hono · Prisma 7 + SQLite (better-sqlite3 driver adapter) · zod · hash-wasm argon2id · Svelte 5 + Vite SPA (Phase 3) · Vitest.
- Keep `<commands>` below current with the real build/lint/test commands.
- Style modeled on ChrisTitusTech/titus-ai `AGENTS.md`: short, imperative rules. Keep it that way.
</scope>

<plan-workflow>
Every non-trivial task starts with planning, before any code is written.

- Plans live in `.claude/plan/*.md`. One file per phase; use `_template.md` there as the starting format.
- When a big task is added, split it into phases. In that first breakdown keep instructions simple and write proper user stories — do not deep-dive yet.
- Detailed planning happens once per iteration, for the current phase only. A detailed plan must conclude: the stack to use (language, framework, libraries, with rationale), data/model changes, file-level scope, and how each step gets verified.
- Every plan file restates shared context so nothing is lost between phases: current user stories (with status), the concluded stack, and decisions made so far. Keep each phase's plan otherwise self-contained.
- If you have a better idea than the one proposed, say so in the plan with an explanation — feedback belongs in the plan, not in silence.
- Include the small but important pieces: risks, open questions, out-of-scope items, migration/rollback notes.
- Track phase status in its plan file and update it as work completes.
</plan-workflow>

<commands>
- `npm install` — install everything (npm workspaces: root + `api/`)
- `npm run dev` — run the API on http://localhost:3000
- `npm test` — the whole Vitest suite (`tests/unit`, `tests/integration`)
- `npm test -- tests/integration/auth.test.ts` — one test file (paths are relative to `api/`)
- `npm run typecheck` — `tsc --noEmit`
- `npm run migrate -- --name <name>` — create and apply a Prisma migration
- `npm run seed` — reseed the dev database
- `npm run reset` — drop, migrate, and reseed the dev database (Prisma blocks this when it detects an AI agent; it needs `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` set to the user's consent text)
- Lint: not configured yet.
</commands>

<coding-guidelines>
- Stupid-simple beats clever. Write the simplest code that works; complexity must justify itself.
- Never invent what a proven library provides. Example: use Prisma, do not hand-roll an ORM.
- Naming, casing, and file layout follow the conventions of the chosen framework — not personal taste.
- Organize code by module (domain-oriented): `api/src/modules/<module>/`. Each module has `<module>.routes.ts` (HTTP only — parse, call, respond) and `<module>.service.ts` (the logic).
- Logic meant to be used across modules goes in `helpers/` for reusability (e.g., hash generate/verify, the "this parent's non-removed children" filter), not inside one module.
- Tests live in the workspace they belong to, outside `src/`: `api/tests/unit`, `api/tests/integration` (the web app gets its own tests later).
- Every function and every flow gets test cases. A function without a test is not done.
</coding-guidelines>

<development-order>
- Contract first. Every API gets a contract before implementation: endpoints, methods, request shape, and returned data. The contract is driven by what the frontend needs, not what the backend can provide — frontend requirements are the priority.
- Data first. Start with the database and data modeling before writing application logic.
- The contract and the data model belong in the phase's detailed plan, so frontend and backend build against the same agreed shapes.
</development-order>

<operating-principles>
- Working code only. Plausibility is not correctness; verify before reporting done.
- Never fabricate file paths, APIs, command output, or test results. Read the file, run the command, or say what is unknown.
- Say when a premise appears wrong before implementing around it.
- Ask before proceeding only when a request has multiple plausible interpretations and the choice materially affects the result.
- Touch only what the task requires. No drive-by refactors, formatting, or cleanup.
- Direct and concise communication. No flattery, filler, or emoji.
</operating-principles>

<editing>
- State the plan or success criteria before editing. For non-trivial work, include the verification you expect to run.
- Read the files you will touch, plus nearby callers and consumers, before changing them.
- Match existing project patterns, naming, and style even if a different approach seems better.
- Minimum change that solves the stated problem. No speculative features, abstractions, or configurability.
- Clean up orphans created by your own change (unused imports, obsolete helpers). Do not delete pre-existing dead code unless asked; mention it in the summary if it matters.
- Keep credentials, tokens, caches, logs, and runtime databases out of the repository.
</editing>

<verification>
- Run the smallest meaningful verification during iteration and a relevant final verification before reporting done.
- If verification fails, fix the cause instead of weakening the check.
- For UI or visual changes, verify visually with screenshots or rendered output.
- Until the stack exists, "verification" means stating expected behavior and confirming it once there is something to run.
</verification>

<git-workflow>
- One branch per feature, named after the feature (e.g., `authentication`). All phases of a feature — create tables, implement login, … — land on that same feature branch; only a new feature gets a new branch.
- Before every commit, run `/simplify` and `/security-review` on the changes and fix what they surface before committing.
</git-workflow>

<maintenance>
- Keep this file short enough to follow. Add rules only when they prevent a real repeat mistake or document durable project behavior.
- When the user corrects an approach, tighten the relevant rule instead of appending a vague warning.
</maintenance>
