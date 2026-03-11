# GinaXams Player

> **⚠️ UI Status Notice**: The user interface is currently undergoing architectural reconstruction. This documentation reflects the **engine capabilities** (domain + application layers), not the current UI state.

GinaXams Player is a fully local, adaptive exam training engine built for structured preparation of official exams.

It runs entirely in the browser, requires no backend, and stores all data locally using IndexedDB.

---

## Architecture Overview

The system follows a strict three-layer architecture:

```
┌─────────────────────────────────────────────────────────────┐
│  Presentation Layer (UI) — Under Reconstruction            │
├─────────────────────────────────────────────────────────────┤
│  Application Layer (Orchestration, Timer, Persistence)     │
├─────────────────────────────────────────────────────────────┤
│  Domain Layer (Pure Logic: Scoring, Weakness, Telemetry)   │
└─────────────────────────────────────────────────────────────┘
```

---

## Core Characteristics

- Fully client-side (no backend)
- Static-host deployable (GitHub Pages compatible)
- Local-first persistence (IndexedDB)
- Privacy-respecting (no data leaves the browser)
- Deterministic and testable domain logic
- Strict TypeScript architecture (strict mode enabled)
- Attempt-based execution model

---

## Golden Data Schema (v2.0) — MANDATORY

All imported exams **must** comply with schema_version "2.0". No legacy formats supported.

### Required Exam Fields

| Field | Type | Description |
|-------|------|-------------|
| `schema_version` | `"2.0"` | Literal string, must be exactly "2.0" |
| `exam_id` | `string` | Unique identifier for the exam |
| `title` | `string` | Human-readable exam title |
| `categorias` | `string[]` | Non-empty array of category strings |
| `total_questions` | `number` | Must equal `questions.length` |
| `questions` | `Question[]` | Array of question objects |

### Required Question Fields

| Field | Type | Description |
|-------|------|-------------|
| `number` | `number` | Question number (unique within exam) |
| `text` | `string` | Question text |
| `categoria` | `string[]` | Subset of exam `categorias` |
| `articulo_referencia` | `string` | Legal article reference |
| `feedback.cita_literal` | `string` | Literal legal citation |
| `feedback.explicacion_fallo` | `string` | Pedagogical failure explanation |
| `answers` | `Answer[]` | Exactly **one** correct answer required |

Strict validation is enforced. Invalid schema throws descriptive errors. No fallback parsing.

---

## Attempt-Based Execution Model

All exam sessions are persistent **Attempt** entities. There are no implicit sessions.

### Attempt Types

| Type | Purpose | Updates Telemetry |
|------|---------|-------------------|
| `free` | Learning mode with instant feedback | **No** |
| `simulacro` | Exam simulation with timer | **Yes** |
| `review` | Adaptive review based on weakness | **Yes** |

### Attempt Structure

```typescript
interface Attempt {
  id: string;                    // Unique identifier
  type: "free" | "simulacro" | "review";
  createdAt: string;             // ISO timestamp
  sourceExamIds: string[];       // Referenced exams
  config: AttemptConfig;         // Type-specific configuration
  parentAttemptId?: string;      // For chained attempts
  result?: AttemptResult;        // Computed after completion
}
```

Attempts are immutable once created. Results are computed using pure functions.

---

## Telemetry Model (Per Question)

Telemetry tracks per-question performance metrics. It is **never** mutated to erase mistakes.

### Tracked Fields

| Field | Type | Description |
|-------|------|-------------|
| `timesCorrect` | `number` | Count of correct answers |
| `timesWrong` | `number` | Count of wrong answers |
| `timesBlank` | `number` | Count of blank answers |
| `consecutiveCorrect` | `number` | Streak of consecutive correct answers |
| `avgResponseTimeMs` | `number` | Rolling average response time |
| `totalSeen` | `number` | Total times question has been presented |
| `lastSeenAt` | `string` | ISO timestamp of last presentation |

### Telemetry Rules

- **Free mode**: Does NOT update telemetry
- **Simulacro & Review**: DO update telemetry
- **Blank answers**: Increase weakness (lower weight than wrong)
- **Wrong answers**: Increase weakness more strongly
- **Consecutive correct**: Reduces weakness via recovery weight
- **Historical counts**: Never deleted (mistakes persist)
- **Weakness score**: Derived at runtime, not stored

### Reset Behavior

- Telemetry can be reset per exam or globally
- Reset removes telemetry entries, not exam data
- Deleting an exam cascades: deletes telemetry + related attempts

---

## Simulacro Mode (Exam Simulation)

Simulacro simulates real exam conditions with weighted multi-exam selection.

### Features

- **Weighted exam selection**: User-configurable weights per exam
- **Random sampling**: Without replacement, deterministic with seeded RNG
- **Configurable parameters**:
  - `questionCount`: Number of questions to present
  - `timeLimitMs`: Time limit in milliseconds
  - `penalty`: Points deducted per wrong answer
  - `reward`: Points awarded per correct answer
- **Auto-submit**: On timer expiration
- **Telemetry**: Generates telemetry updates (does not consume)

### Scoring Formula

```
score = (correct × reward) - (wrong × penalty) - (blank × blankPenalty)
percentage = round((correct / total) × 100)
```

Scoring is a pure function with no side effects.

---

## Review Mode (Adaptive Engine)

Review mode uses telemetry to compute weakness and prioritize questions needing practice.

### Weakness Formula

```
weakness = (timesWrong × wrongWeight)
         + (timesBlank × blankWeight)
         + timePenalty
         - (consecutiveCorrect × recoveryWeight)

where timePenalty = avgResponseTimeMs > weakTimeThresholdMs
                  ? (avgResponseTimeMs - weakTimeThresholdMs) / weakTimeThresholdMs
                  : 0

Result is clamped to >= 0
```

### Default Weights

| Parameter | Default Value |
|-----------|---------------|
| `wrongWeight` | 2.0 |
| `blankWeight` | 1.2 |
| `recoveryWeight` | 1.0 |
| `weakTimeThresholdMs` | 15000 (15 seconds) |

### Review Generation Flow

1. Collect telemetry for selected exam(s)
2. Compute weakness score for each question
3. Sort by weakness descending (highest weakness first)
4. Take top N questions (default 60, configurable)
5. If insufficient questions with telemetry, fill with least recently seen
6. Create persistent `Attempt` (type: review)
7. Execute and update telemetry

Review sessions feed themselves naturally via telemetry updates.

---

## IndexedDB Schema

Database version: **4** (Phase 7: Removed legacy progress store)

### Stores

| Store | Purpose | Key Path |
|-------|---------|----------|
| `exams` | StoredExam objects | `id` |
| `folders` | Folder objects | `id` |
| `attempts` | Attempt records | `id` |
| `questionTelemetry` | Per-question telemetry | `id` (format: `${examId}::${questionNumber}`) |

### Cascade Deletion

Deleting an exam automatically deletes:
- All telemetry entries for that exam
- All attempts that reference the exam

---

## Golden Data JSON Format (v2.0)

### Example Structure

```json
{
  "schema_version": "2.0",
  "exam_id": "unique-exam-id",
  "title": "Official Exam Title",
  "categorias": ["Constitucion", "TREBEP"],
  "total_questions": 2,
  "questions": [
    {
      "number": 1,
      "text": "Question text goes here?",
      "categoria": ["Constitucion"],
      "articulo_referencia": "Art. 103 CE",
      "feedback": {
        "cita_literal": "Literal text from the official source...",
        "explicacion_fallo": "Explanation of why wrong answers are incorrect..."
      },
      "answers": [
        { "letter": "A", "text": "Option A text", "isCorrect": false },
        { "letter": "B", "text": "Option B text", "isCorrect": true },
        { "letter": "C", "text": "Option C text", "isCorrect": false },
        { "letter": "D", "text": "Option D text", "isCorrect": false }
      ]
    }
  ]
}
```

---

## Development

### Tech Stack

- **Build Tool**: Vite
- **Language**: TypeScript (strict mode: `noImplicitAny`, `strictNullChecks`)
- **Testing**: Vitest
- **Persistence**: IndexedDB

### Running Tests

```bash
npm test          # Run tests in watch mode
npm test -- --run # Run tests once
```

### Required Test Coverage

- Schema validation
- Weighted distribution logic
- Score calculation
- Weakness calculation
- Telemetry state transitions
- Reset logic
- Cascade deletion logic

---

## Non-Goals

- No backend integration
- No analytics dashboard
- No framework migration (React/Vue/etc.)
- No legacy schema compatibility
- No telemetry mutation shortcuts

---

## License

MIT

## Architecture Overview

GinaXams Player uses a layered architecture where each layer has a clear responsibility and boundary.

### Layered Architecture

- src/domain: Pure business rules and deterministic logic, including scoring, weakness computation, review selection, telemetry transitions, and schema validation.
- src/application: Use-case orchestration and runtime flow control, including attempt coordination, timers, settings coordination, and integration between domain and persistence.
- src/storage: IndexedDB access, schema versioning, migrations, and cascade operations for persisted exams, attempts, and telemetry.
- src/ui: Presentation components, view composition, and user interaction handling. This layer renders state and dispatches user intent to application services.
- src/core: App bootstrap and composition root. It wires controllers, services, and UI mounting so the full system starts with explicit dependencies.

### Deterministic Domain Design

- Domain logic must be deterministic: the same inputs must always produce the same outputs.
- Domain functions do not call Math.random or Date.now.
- Any randomness or clock behavior is injected from outside the domain, typically by application orchestration using seeded RNG and explicit timestamps.

### Adaptive Review Pipeline

Conceptual flow:

1. Telemetry collection from persisted per-question history.
2. Weakness calculation using configured weights and response-time penalty rules.
3. Question ranking by descending weakness.
4. Question selection for the target review size, with fallback fill behavior when needed.
5. Attempt execution that records outcomes and updates telemetry for supported attempt types.

### Telemetry Model

Tracked metrics per question:

- timesCorrect
- timesWrong
- timesBlank
- consecutiveCorrect
- avgResponseTimeMs
- totalSeen
- lastSeenAt

Weakness is not stored as a persistent field. It is derived at runtime from telemetry plus configuration.

### Testing Strategy

- Domain logic is fully unit tested.
- Core domain functions are deterministic pure functions, making results reproducible.
- The project uses a Vitest test suite for automated verification.
- UI behavior is primarily validated through manual testing during reconstruction.
