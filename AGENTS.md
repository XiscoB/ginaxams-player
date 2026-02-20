# GinaXams Player — AI Agent Engineering Contract (v2.0)

## Project Status

GinaXams Player is evolving from a basic JSON exam player (MVP) into a deterministic, fully local, adaptive exam training engine.

This file defines the architectural, behavioral, and engineering constraints that ALL AI agents must follow when modifying this repository.

The MVP zero-build philosophy has been intentionally replaced.
The system now prioritizes correctness, determinism, and testability.

Deployment target remains: Static hosting (GitHub Pages compatible).

---

# Core Principles

1. Fully client-side. No backend.
2. Local-first persistence using IndexedDB.
3. Strict TypeScript (noImplicitAny, strictNullChecks enabled).
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

All imported exams must comply with schema_version "2.0".

## Exam-Level Required Fields

- schema_version: "2.0"
- exam_id: string
- title: string
- categorias: string[] (non-empty)
- total_questions: number
- questions: Question[]

## Question-Level Required Fields

- number: number
- text: string
- categoria: string[] (must be subset of exam.categorias)
- articulo_referencia: string
- feedback:
  - cita_literal: string
  - explicacion_fallo: string
- answers: exactly one correct answer

Strict validation is required.
Invalid schema must throw descriptive errors.
No fallback parsing.
No legacy support.

Agents must not introduce optional fields to bypass validation.

---

# Execution Model — Attempt-Based Architecture

The system operates using persistent Attempt entities.

## Attempt Types

- "free" → Learning mode (no telemetry updates)
- "simulacro" → Exam simulation mode
- "review" → Adaptive review mode

## Attempt Structure

- id
- type
- createdAt
- sourceExamIds
- config
- parentAttemptId (optional)

Attempts are persisted.
Attempts must not be implicit.

---

# Telemetry Model (Per Question)

Telemetry is stored per question (not per attempt).

Tracked fields:

- timesCorrect
- timesWrong
- timesBlank
- consecutiveCorrect
- avgResponseTimeMs
- totalSeen
- lastSeenAt

Rules:

- Free mode does NOT update telemetry.
- Simulacro and Review DO update telemetry.
- Blank answers increase weakness (lower weight than wrong).
- Wrong answers increase weakness more strongly.
- Consecutive correct answers reduce weakness.
- Historical mistake counts are never deleted.
- Weakness score is derived at runtime.
- Telemetry can be reset per exam or globally.
- Deleting an exam deletes its telemetry and related attempts.

Agents must not implement telemetry mutation shortcuts.

---

# Simulacro Mode

Simulacro is a strict exam simulation engine.

Properties:

- Weighted exam selection (user-editable weights).
- Random sampling without repetition.
- Configurable:
  - questionCount
  - timeLimit
  - penalty
  - reward
- Auto-submit on timer expiration.
- Does NOT consume telemetry.
- DOES generate telemetry.

Scoring must use a pure function.

Timer logic must be isolated from domain logic.

---

# Review Mode (Adaptive Engine)

Review mode uses telemetry to compute weakness.

Weakness formula:

    (timesWrong * wrongWeight)

- (timesBlank \* blankWeight)
- timePenalty

* (consecutiveCorrect \* recoveryWeight)

Clamp to >= 0.

Review generation flow:

1. Collect telemetry for selected exams.
2. Compute weakness score per question.
3. Sort descending.
4. Take top N (default 60, configurable).
5. If insufficient, fill with least recently seen.
6. Create persistent Attempt (type: review).
7. Execute and update telemetry.

Review sessions must feed themselves naturally via telemetry updates.

---

# Default Parameters

Defaults must be centralized and configurable.

Required defaults:

- reviewQuestionCount: 60
- wrongWeight: 2
- blankWeight: 1.2
- recoveryWeight: 1
- weakTimeThresholdMs: 15000

Agents must not hardcode magic numbers outside centralized defaults.

---

# IndexedDB Rules

- Database version must be incremented for schema changes.
- Migration logic must be explicit in onupgradeneeded.
- No silent destructive upgrades.
- Store separation required:
  - exams
  - folders
  - progress (legacy)
  - attempts
  - questionTelemetry
  - settings (if introduced)

Deleting an exam must cascade:

- Delete related telemetry
- Delete related attempts

Telemetry resets must not delete exam data.

---

# Required Unit Test Coverage

The following must have unit tests:

- Schema validation
- Weighted distribution logic
- Score calculation
- Weakness calculation
- Telemetry state transitions
- Reset logic
- Cascade deletion logic

UI testing may remain manual.

Domain logic must be fully testable without DOM.

---

# Non-Goals

- No backend integration.
- No analytics dashboard (for now).
- No framework migration.
- No legacy schema compatibility.
- No telemetry mutation hacks.
- No weakening of strict TypeScript settings.

---

# Engineering Philosophy

This is no longer a toy exam player.

It is a deterministic, testable, adaptive training engine.

Schema first.
Types first.
Tests first.
Then behavior.

Agents must preserve architectural integrity above convenience.
