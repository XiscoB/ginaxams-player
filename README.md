# GinaXams Player

GinaXams Player is a fully local, adaptive exam training engine built for structured preparation of official exams.

It runs entirely in the browser, requires no backend, and stores all data locally using IndexedDB.

---

## Vision

This project evolved from a simple JSON exam player into a deterministic, telemetry-driven training engine.

The goal is not just to practice questions —  
but to simulate real exam conditions and force targeted improvement through adaptive review.

---

## Core Characteristics

- Fully client-side (no backend)
- Static-host deployable (GitHub Pages compatible)
- Local-first persistence (IndexedDB)
- Privacy-respecting (no data leaves the browser)
- Deterministic and testable domain logic
- Strict TypeScript architecture

---

## v1.1 Capabilities

### 1. Golden Data Schema (v2.0)

All exams must follow a strict schema with:

- Categorization
- Legal article references
- Literal legal citations
- Pedagogical failure explanations

No legacy formats supported.

---

### 2. Three Execution Modes

#### Free Mode

Learning mode with instant feedback.
Does not update telemetry.

#### Simulacro Mode

Realistic exam simulation.

- Weighted multi-exam selection
- Random sampling without repetition
- Configurable:
  - Question count
  - Time limit
  - Penalty
  - Reward
- Auto-submit on timeout
- Generates telemetry

#### Review Mode (Adaptive Engine)

Uses telemetry to generate a weakness-ranked question set.

- Default 60 questions (configurable)
- Weakness-based prioritization
- Feeds on itself
- Persistent Attempt records

---

### 3. Telemetry Engine

Tracked per question:

- timesCorrect
- timesWrong
- timesBlank
- consecutiveCorrect
- avgResponseTimeMs
- totalSeen
- lastSeenAt

Weakness is derived, not stored.

Telemetry can be:

- Reset per exam
- Reset globally

Deleting an exam deletes its telemetry and related attempts.

---

## Golden Data JSON Format (v2.0)

### Required Structure

```json
{
  "schema_version": "2.0",
  "exam_id": "unique-id",
  "title": "Exam Title",
  "categorias": ["Constitucion", "TREBEP"],
  "total_questions": 2,
  "questions": [
    {
      "number": 1,
      "text": "Question text",
      "categoria": ["Constitucion"],
      "articulo_referencia": "Art. 103 CE",
      "feedback": {
        "cita_literal": "Literal text from the BOE...",
        "explicacion_fallo": "Explanation of why the wrong answer is incorrect..."
      },
      "answers": [
        { "letter": "A", "text": "Option A", "isCorrect": false },
        { "letter": "B", "text": "Option B", "isCorrect": true }
      ]
    }
  ]
}
```
