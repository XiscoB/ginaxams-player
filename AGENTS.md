# GinaXams Player — AI Agent Engineering Contract (v2.1)

## Project Status

GinaXams Player is a deterministic, fully local, adaptive exam training engine.

**⚠️ CRITICAL NOTE**: The UI layer is currently undergoing architectural reconstruction. Documentation reflects **engine capabilities** (domain + application layers), not the current UI state. Agents must preserve engine correctness even if UI appears inconsistent.

This file defines the architectural, behavioral, and engineering constraints that ALL AI agents must follow when modifying this repository.

The MVP zero-build philosophy has been intentionally replaced. The system prioritizes correctness, determinism, and testability.

Deployment target remains: Static hosting (GitHub Pages compatible).

---

# Core Principles

1. Fully client-side. No backend.
2. Local-first persistence using IndexedDB.
3. Strict TypeScript (`noImplicitAny`, `strictNullChecks` enabled).
4. Deterministic domain logic.
5. Domain layer isolated from UI layer.
6. Pure functions for scoring and weakness calculation.
7. Telemetry history is never mutated to erase mistakes.
8. IndexedDB schema changes must be versioned explicitly.
9. No legacy schema compatibility.
10. Default parameters must exist but remain user-configurable.

Agents must not weaken these principles.

---

# Tooling Requirements

The project uses:

- Vite (build tool)
- TypeScript (strict mode)
- Vitest (unit testing)
- Static build output
- GitHub Pages compatible deployment

Build artifacts must remain static-host friendly.
No backend services.
No runtime external dependencies.

Framework migrations (React/Vue/etc.) are NOT allowed.

---

# Golden Data Schema (MANDATORY)

All imported exams must comply with `schema_version: "2.0"`. No exceptions.

## Exam-Level Required Fields

| Field | Type | Constraint |
|-------|------|------------|
| `schema_version` | `"2.0"` | Literal string |
| `exam_id` | `string` | Non-empty, unique |
| `title` | `string` | Non-empty |
| `categorias` | `string[]` | Non-empty array |
| `total_questions` | `number` | Must equal `questions.length` |
| `questions` | `Question[]` | Non-empty array |

## Question-Level Required Fields

| Field | Type | Constraint |
|-------|------|------------|
| `number` | `number` | Positive integer |
| `text` | `string` | Non-empty |
| `categoria` | `string[]` | Subset of `exam.categorias` |
| `articulo_referencia` | `string` | Non-empty |
| `feedback.cita_literal` | `string` | Non-empty |
| `feedback.explicacion_fallo` | `string` | Non-empty |
| `answers` | `Answer[]` | Exactly one `isCorrect: true` |

Strict validation is required.
Invalid schema must throw descriptive errors.
No fallback parsing.
No legacy support.

Agents must not introduce optional fields to bypass validation.

---

# Execution Model — Attempt-Based Architecture

The system operates using persistent Attempt entities. There are no implicit sessions.

## Attempt Types

| Type | Purpose | Telemetry Updates |
|------|---------|-------------------|
| `"free"` | Learning mode (instant feedback) | **NO** |
| `"simulacro"` | Exam simulation mode | **YES** |
| `"review"` | Adaptive review mode | **YES** |

## Attempt Structure

```typescript
interface Attempt {
  id: string;                    // UUID
  type: "free" | "simulacro" | "review";
  createdAt: string;             // ISO 8601 timestamp
  sourceExamIds: string[];       // Referenced exams
  config: AttemptConfig;         // Type-specific configuration
  parentAttemptId?: string;      // Optional parent reference
  result?: AttemptResult;        // Computed post-completion
}
```

Attempts are persisted to IndexedDB.
Attempts must not be implicit.
Attempt results are computed via pure functions.

---

# Telemetry Model (Per Question)

Telemetry is stored per question, not per attempt.

## Tracked Fields

| Field | Type | Description |
|-------|------|-------------|
| `timesCorrect` | `number` | Count of correct answers |
| `timesWrong` | `number` | Count of wrong answers |
| `timesBlank` | `number` | Count of blank answers |
| `consecutiveCorrect` | `number` | Streak of correct answers |
| `avgResponseTimeMs` | `number` | Rolling average response time |
| `totalSeen` | `number` | Total presentations |
| `lastSeenAt` | `string` | ISO timestamp (empty if never seen) |

## Telemetry Rules

- Free mode does NOT update telemetry.
- Simulacro and Review DO update telemetry.
- Blank answers increase weakness (lower weight than wrong).
- Wrong answers increase weakness more strongly.
- Consecutive correct answers reduce weakness.
- Historical mistake counts are **never** deleted.
- Weakness score is **derived at runtime**, not stored.
- Telemetry can be reset per exam or globally.
- Deleting an exam deletes its telemetry and related attempts (cascade).

Agents must not implement telemetry mutation shortcuts.

---

# Simulacro Mode

Simulacro is a strict exam simulation engine.

## Properties

- Weighted exam selection (user-editable weights)
- Random sampling without replacement
- Configurable:
  - `questionCount`: Number of questions
  - `timeLimitMs`: Time limit in milliseconds
  - `penalty`: Points deducted per wrong answer
  - `reward`: Points awarded per correct answer
- Auto-submit on timer expiration
- Does NOT consume telemetry (uses for selection only if needed)
- DOES generate telemetry updates

## Scoring

```
score = (correct × reward) - (wrong × penalty)
percentage = round((correct / total) × 100)
```

Scoring must use a pure function.
Timer logic must be isolated from domain logic.

---

# Review Mode (Adaptive Engine)

Review mode uses telemetry to compute weakness and prioritize questions.

## Weakness Formula

```
weakness = (timesWrong × wrongWeight)
         + (timesBlank × blankWeight)
         + timePenalty
         - (consecutiveCorrect × recoveryWeight)

where timePenalty = avgResponseTimeMs > weakTimeThresholdMs
                  ? (avgResponseTimeMs - weakTimeThresholdMs) / weakTimeThresholdMs
                  : 0

Result clamped to >= 0
```

## Review Generation Flow

1. Collect telemetry for selected exams
2. Compute weakness score per question
3. Sort descending by weakness
4. Take top N (default 60, configurable)
5. If insufficient questions, fill with least recently seen
6. Create persistent Attempt (type: review)
7. Execute and update telemetry

Review sessions must feed themselves naturally via telemetry updates.

---

# Default Parameters

Defaults must be centralized in `src/domain/defaults.ts`.

## Required Defaults

| Parameter | Value | Description |
|-----------|-------|-------------|
| `reviewQuestionCount` | 60 | Questions per review session |
| `wrongWeight` | 2.0 | Weight for wrong answers |
| `blankWeight` | 1.2 | Weight for blank answers |
| `recoveryWeight` | 1.0 | Weight for consecutive correct |
| `weakTimeThresholdMs` | 15000 | Time threshold for penalty (15s) |

Agents must not hardcode magic numbers outside centralized defaults.
Domain functions receive configuration via injection (no direct defaults imports).

---

# IndexedDB Schema

**Current Version**: 4 (Phase 7: Removed legacy progress store)

## Stores

| Store | Key Path | Indexes |
|-------|----------|---------|
| `exams` | `id` | `folderId`, `addedAt` |
| `folders` | `id` | `name` |
| `attempts` | `id` | `type`, `createdAt` |
| `questionTelemetry` | `id` | `examId`, `examId_questionNumber`, `lastSeenAt` |

## Migration Rules

- Database version must be incremented for schema changes.
- Migration logic must be explicit in `onupgradeneeded`.
- No silent destructive upgrades.
- Legacy store removal must be handled (see v3→v4 progress removal).

## Cascade Deletion

Deleting an exam must cascade:
- Delete related telemetry (via `examId` index)
- Delete related attempts (via `sourceExamIds` check)

Telemetry resets must not delete exam data.

---

# Required Unit Test Coverage

The following must have unit tests:

- Schema validation (`validation.test.ts`)
- Weighted distribution logic (`distribution.spec.ts`)
- Score calculation (`scoring.spec.ts`, `scoring.test.ts`)
- Weakness calculation (`weakness.test.ts`)
- Telemetry state transitions (`telemetryEngine.test.ts`)
- Reset logic (`cascadeDeletion.test.ts`)
- Cascade deletion logic (`cascadeDeletion.test.ts`)
- Attempt runner (`attemptRunner.test.ts`)
- Review selection (`reviewSelection.test.ts`, `review.test.ts`)

UI testing may remain manual.
Domain logic must be fully testable without DOM.

---

# Domain Layer Constraints

## Purity Requirements

All domain functions must be pure:
- No side effects
- No mutation of inputs
- No DOM dependencies
- No IndexedDB calls
- No `Date.now()` or `Math.random()` without injection
- Deterministic: same inputs → same outputs

## File Organization

| Layer | Location | Constraints |
|-------|----------|-------------|
| Domain | `src/domain/` | Pure functions only, no external deps |
| Application | `src/application/` | Orchestration, timer, side effects |
| Storage | `src/storage/` | IndexedDB operations |
| UI | `src/` (root level) | DOM manipulation, event handling |

## Forbidden in Domain Layer

- `window`, `document`, `navigator`
- `fetch`, `XMLHttpRequest`
- `indexedDB`
- `localStorage`, `sessionStorage`
- i18n imports
- Any import from `../application/`, `../storage/`, `../i18n/`

---

# Non-Goals

- No backend integration.
- No analytics dashboard (for now).
- No framework migration.
- No legacy schema compatibility.
- No telemetry mutation hacks.
- No weakening of strict TypeScript settings.
- No UI reconstruction shortcuts that bypass domain rules.

---

# Engineering Philosophy

This is a deterministic, testable, adaptive training engine.

**Schema first. Types first. Tests first. Then behavior.**

Agents must preserve architectural integrity above convenience.

When in doubt:
1. Prefer pure functions
2. Prefer immutable data
3. Prefer explicit over implicit
4. Prefer testable over convenient

---

# UI Reconstruction Notice

The presentation layer is currently being rebuilt to align with the attempt-based architecture documented above.

## Current State

- Domain layer: ✅ Complete and tested
- Application layer: ✅ Complete (timer, orchestration)
- Storage layer: ✅ Complete (IndexedDB v4)
- UI layer: 🔄 Under reconstruction

## Agent Guidelines During Reconstruction

- Do not modify domain logic to accommodate UI limitations
- Do not bypass Attempt-based execution for convenience
- Do not reintroduce MVP patterns (implicit sessions, progress-based execution)
- UI must consume domain layer through proper APIs
- All execution flows must create persistent Attempts

## Documentation Priority

Engine documentation (this file, domain types, function docs) takes precedence over UI behavior during reconstruction. If UI behaves differently than documented, the UI is wrong, not the documentation.
