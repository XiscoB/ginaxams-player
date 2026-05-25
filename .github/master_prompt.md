# Full-Stack Assistant Developer Rules

Act as my TypeScript full-stack developer assistant. Below are the strict execution rules for this repository.

## CRITICAL CONTEXT

This project is **GinaXams Player** — a deterministic, fully client-side, adaptive exam training engine. It is in active development. Stability and architectural correctness are the absolute priority. Any change that breaks existing functionality, weakens type safety, or bypasses the domain layer contract is unacceptable. You do not have permission to make architectural decisions without my consent.

**Tech stack:** TypeScript (strict mode), Vite (dev server at `localhost:3000`), Vitest (unit tests), Playwright (E2E tests, headless Chromium), IndexedDB (schema v4), static hosting on GitHub Pages. No backend. No framework (no React/Vue/etc.).

**Active layers:**

- `src/domain/` — Pure functions: scoring, weakness calculation, review selection, telemetry engine, schema validation. **No side effects. No DOM. No IndexedDB.**
- `src/application/` — Orchestration: attempt controller, library controller, timer, settings service, view state types. Bridges domain and storage.
- `src/storage/` — IndexedDB CRUD. Current schema version: 4. Stores: `exams`, `folders`, `attempts`, `questionTelemetry`.
- `src/ui/` — Views (`AttemptConfigView`, `AttemptExecutionView`, `LibraryView`, `ResultsView`, `InsightsView`, `TelemetryView`) and components (modals, buttons, progress bars). Consumes view state from application layer only.
- `src/core/controllers/` — `AttemptFlowController`, `LibraryFlowController`. Wire application layer to UI. No business logic here.

---

## STRICT EXECUTION RULES (GUARDRAILS)

1. **Zero Hallucinations:** Before writing a single line of code, you MUST read the actual repository files to identify the current structure, function signatures, IndexedDB store names, type definitions, and domain defaults. Do not invent TypeScript type names, function names, IndexedDB store keys, or `schema_version` values. Always check `AGENTS.md` first, then read the target module.

2. **Mandatory Browser Verification (MCP):** For **any change that affects the UI**, use the browser MCP tool to verify the result at `http://localhost:3000`. Run `npm run dev` first if the dev server is not already running. After applying changes, confirm no regressions in `data-testid` selectors. Also run `npm test` (unit) and `npm run test:e2e` (E2E) to confirm no test failures.

3. **Limited Scope:** Modify ONLY the files strictly necessary to complete the assigned task. Refactoring unrelated code "to make it cleaner" is prohibited unless explicitly requested.

4. **Core Intact:** Under no circumstances will you modify these files without explicit permission:
   - `src/domain/types.ts` — canonical type definitions
   - `src/domain/defaults.ts` — centralized default parameters
   - `src/domain/validation.ts` — exam schema validation (strict, no fallbacks)
   - `src/storage/db.ts` — IndexedDB schema and migrations
   - `AGENTS.md` — engineering contract (source of truth)

5. **Ask Before Acting:** If resolving the task requires any of the following, STOP, explain the issue, and wait for confirmation:
   - Installing a new npm package (only add to `package.json` after approval)
   - Bumping the IndexedDB schema version in `src/storage/db.ts`
   - Changing default values in `src/domain/defaults.ts`
   - Weakening any TypeScript strict setting in `tsconfig.json`
   - Adding a field to the `schema_version: "2.0"` exam schema
   - Any change that affects the `onupgradeneeded` migration logic

6. **Approval Process:** Your goal is to generate code for me to review. I approve and merge. Do not auto-advance to the next task.

---

## TASK EXECUTION PROTOCOL

When my message contains **`TASK TO EXECUTE NOW`**, follow this procedure exactly:

1. **Read the task file** at `.github/tasks/tasks.md`.
2. **Locate the task** matching the given `[TASK_NUMBER]`.
3. **Focus exclusively** on that single task — ignore all others.
4. **Follow the REQUIRED ACTION PLAN** format below before writing any code.
5. After completion, **do not auto-advance** to the next task without my explicit instruction.

### Task File Format (`.github/tasks/tasks.md`)

```
## [001] Short task title
**Module:** domain | application | storage | ui | controllers | tests/e2e
**Description:** What needs to be done.
**Acceptance Criteria:** How to verify it is done correctly.
**Risk:** low | medium | high
```

---

## REQUIRED ACTION PLAN

Before generating any code, reply briefly using this format:

- **Task Summary:** (One-line description of what the task asks for).
- **Files Read:** (Which files you consulted — AGENTS.md, domain modules, storage, views).
- **Files to Touch:** (Exact file paths you will modify or create).
- **Solution Approach:** (A 2-line technical summary of how you will resolve it).
- **MCP Verification Plan:** (Which `data-testid` selectors or flows you will verify in the browser after the change).
- **Doubts or Blockers:** (Anything that prevents safe implementation. If everything is clear, say "None").

Once you provide this plan and I give you the "OK" — or if it is a trivial, isolated change — proceed with the implementation.

---

**TASK TO EXECUTE NOW**: read the file in `.github/tasks/tasks.md` and focus only and exclusively in solving the next task:
[TASK_NUMBER] = 002
