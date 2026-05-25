# GinaXams Player — GitHub Copilot Instructions

GinaXams Player is a **deterministic, fully client-side, adaptive exam training engine** deployed as a static site on GitHub Pages. There is no backend. All persistence is IndexedDB.

---

## Tech Stack

- **TypeScript** (strict mode — `noImplicitAny`, `strictNullChecks` enabled; never weaken)
- **Vite** — build tool and dev server (port 3000)
- **Vitest** — unit testing (pure node environment, no DOM)
- **Playwright** — E2E testing (headless Chromium against `http://localhost:3000`)
- **IndexedDB** — only persistence layer (schema version 4, store: `exams`, `folders`, `attempts`, `questionTelemetry`)

---

## Architecture — Layer Contract

| Layer       | Path                    | Rule                                                                                                                  |
| ----------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Domain      | `src/domain/`           | **Pure functions only.** No side effects, no DOM, no IndexedDB, no `Date.now()` or `Math.random()` without injection. |
| Application | `src/application/`      | Orchestration, timer, view state. May call domain and storage.                                                        |
| Storage     | `src/storage/`          | IndexedDB CRUD only. Schema changes require explicit version bump in `onupgradeneeded`.                               |
| UI          | `src/ui/`               | Views + components. Consumes view state from application layer — never imports from `domain/` or `storage/` directly. |
| Controllers | `src/core/controllers/` | Wire application layer to UI. No business logic.                                                                      |

---

## Core Invariants

- Domain functions must be pure: same inputs → same outputs, no mutations of input arguments.
- Telemetry history is **never** mutated to erase past mistakes.
- `schema_version: "2.0"` is a required literal on all exam imports — strict validation, no fallbacks.
- IndexedDB schema version must be incremented for any store/index change.
- Cascade deletion: deleting an exam must delete related telemetry and attempts.
- All default parameters live in `src/domain/defaults.ts`. No magic numbers in domain functions.
- Framework migrations (React/Vue/etc.) are **not allowed**.

---

## Test Conventions

- **Unit tests** (`src/**/__tests__/`) — Vitest, pure node, no DOM globals.
- **E2E tests** (`tests/e2e/`) — Playwright, `data-testid` selectors only (never rely on CSS classes or positional selectors).
- `data-testid` attributes are the UI contract for E2E; always add them to new interactive elements.

---

## MCP / Browser Verification

For **any change that affects the UI**, verify behavior via the browser MCP tool at `http://localhost:3000` (run `npm run dev` first). Confirm no `data-testid` selector regressions before considering a task complete.

---

## Protected Files — Consult `AGENTS.md` Before Touching

- `src/domain/types.ts` — canonical type definitions
- `src/domain/defaults.ts` — centralized default parameters
- `src/domain/validation.ts` — exam schema validation
- `src/storage/db.ts` — IndexedDB schema and migrations
- `AGENTS.md` — engineering contract (source of truth)
