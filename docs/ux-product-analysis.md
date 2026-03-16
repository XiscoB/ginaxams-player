# Phase 10 — UX/Product Architecture Analysis

> GinaXams Player — Adaptive Exam Training Engine

---

## Section 1 — Engine Capability Review

### System Signal Pipeline

The engine computes a layered hierarchy of training signals, each building on the previous:

```
┌──────────────────────────────────────────────────────────────────┐
│                     Raw Telemetry (per question)                 │
│  timesCorrect · timesWrong · timesBlank · consecutiveCorrect     │
│  avgResponseTimeMs · totalSeen · lastSeenAt                      │
└──────────────────────┬───────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│   Question Weakness Score (weakness.ts)                          │
│   Formula: (wrong×W) + (blank×B) + timePenalty - (streak×R)     │
│   Clamped to ≥ 0                                                 │
└──────────────────────┬───────────────────────────────────────────┘
                       │
            ┌──────────┴──────────┐
            ▼                     ▼
┌────────────────────┐  ┌─────────────────────────────────────────┐
│ Question Difficulty│  │ Category Weakness (categoryWeakness.ts) │
│ (questionDifficul- │  │ Average weakness per category            │
│  ty.ts)            │  └──────────────────┬──────────────────────┘
│ (wrong+blank)/seen │                     │
│ → easy/medium/hard │          ┌──────────┴──────────┐
└────────┬───────────┘          ▼                     ▼
         │            ┌──────────────────┐  ┌─────────────────────┐
         │            │ Category Stats   │  │ Category Mastery    │
         │            │ (categoryStats)  │  │ (categoryMastery)   │
         │            │ accuracy per cat │  │ weak/learning/      │
         │            └──────────────────┘  │ mastered             │
         │                                  └──────────┬──────────┘
         │                                             │
         └───────────┬─────────────────────────────────┘
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│   Trap Detection (trapDetection.ts)                              │
│   trapScore = difficultyScore × categoryMasteryScore             │
│   → none / possible / confirmed                                  │
└──────────────────────┬───────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│   Spaced Repetition Cooldown (spacedRepetition.ts)               │
│   Cooldown multiplier based on lastSeenAt                        │
│   Prevents recently-seen questions from reappearing              │
└──────────────────────┬───────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│   Adaptive Review Selection (reviewSelection.ts)                 │
│   60% weakest · 30% medium · 10% random/unseen                  │
│   + mastery boost/penalty · + cooldown · + difficulty adjustment  │
└──────────────────────┬───────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│   Exam Readiness Score (examReadiness.ts)                        │
│   (avgCategoryMastery × 40) + (recentSimulacroAccuracy × 40)    │
│   + (weaknessRecoveryRate × 20)                                  │
│   → not_ready / almost_ready / ready / exam_ready                │
└──────────────────────────────────────────────────────────────────┘
```

### What the System Knows About the User

| Data Point                                                                | Source                                 | Granularity            |
| ------------------------------------------------------------------------- | -------------------------------------- | ---------------------- |
| How often each question is answered correctly, incorrectly, or left blank | `QuestionTelemetry`                    | Per question, per exam |
| Current learning streak (consecutive correct)                             | `QuestionTelemetry.consecutiveCorrect` | Per question           |
| Average response time                                                     | `QuestionTelemetry.avgResponseTimeMs`  | Per question           |
| When each question was last seen                                          | `QuestionTelemetry.lastSeenAt`         | Per question           |
| How many times each question has been presented                           | `QuestionTelemetry.totalSeen`          | Per question           |
| Score results for every attempt                                           | `Attempt.result`                       | Per attempt            |
| Which mode was used (free/simulacro/review)                               | `Attempt.type`                         | Per attempt            |
| Time spent on attempts                                                    | Derived from `createdAt` + duration    | Per attempt            |

### What Insights the Engine Can Generate

| Insight                        | Domain Function                                     | Description                                                                                                                                                                                               |
| ------------------------------ | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Question Weakness**          | `computeWeakScore()`                                | Numeric score indicating how poorly the user performs on a specific question. Higher = worse. Combines error frequency, blank frequency, slow response time, and consecutive-correct recovery.            |
| **Question Difficulty**        | `computeDifficultyScore()` / `classifyDifficulty()` | Ratio of failures to total attempts. Classified as easy (<0.3), medium (0.3–0.6), or hard (≥0.6). Represents inherent question hardness, not user weakness.                                               |
| **Category Weakness**          | `computeCategoryWeakness()`                         | Average weakness score across all questions in a category. Identifies topic areas where the user struggles most. Sorted by score descending.                                                              |
| **Category Stats**             | `computeCategoryStats()`                            | Raw performance statistics per category: questions attempted, questions correct, accuracy ratio.                                                                                                          |
| **Category Mastery**           | `computeCategoryMastery()`                          | Combines weakness and accuracy into a three-level classification: `weak`, `learning`, `mastered`. Each category gets a clear status.                                                                      |
| **Trap Detection**             | `computeTrapSignals()`                              | Identifies "trick questions" — questions that users fail despite mastering the category. Signals misleading wording or tricky answer options. Levels: `none`, `possible`, `confirmed`.                    |
| **Spaced Repetition Cooldown** | `computeCooldownPenalty()`                          | Prevents recently-answered questions from appearing immediately in review. Linear decay over a configurable window (default 5 minutes).                                                                   |
| **Exam Readiness**             | `computeExamReadiness()`                            | Composite score (0–100) estimating exam preparedness. Weights: 40% category mastery, 40% recent simulacro scores, 20% weakness recovery rate. Levels: `not_ready`, `almost_ready`, `ready`, `exam_ready`. |
| **Attempt Statistics**         | `getAttemptStatsForExam()`                          | Per-exam stats: attempt count, last score, best score.                                                                                                                                                    |
| **Weakness Recovery Rate**     | `computeWeaknessRecoveryRate()`                     | Measures how well the user is recovering on previously-seen questions, based on consecutive correct streaks.                                                                                              |

### What Each Signal Means for the User

| Signal                | User Meaning                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Weakness Score**    | "This question is something I consistently get wrong or answer too slowly. I need to study it more."                |
| **Difficulty Level**  | "This question is inherently hard — most people struggle with it, not just me."                                     |
| **Category Weakness** | "These are the topics I'm weakest in overall."                                                                      |
| **Category Mastery**  | "In this topic area, I'm performing at a weak/learning/mastered level."                                             |
| **Trap Signal**       | "I know this topic well, but this specific question keeps tripping me up. It's probably worded in a confusing way." |
| **Cooldown**          | "The system is spacing out my review to help me retain information better."                                         |
| **Exam Readiness**    | "Based on my performance across all metrics, here's how prepared I am for the real exam."                           |
| **Recovery Rate**     | "I am / am not improving on the questions I previously got wrong."                                                  |

---

## Section 2 — Key User Problems

### Problem 1: "I don't know what to study next"

**Pain**: After several practice sessions, the user has no clear guidance on what topics need attention. They either re-study everything or pick topics randomly.

**Engine Solution**: Category Weakness and Category Mastery signals directly identify which topics need the most work. The Adaptive Review engine automatically prioritizes the weakest questions.

### Problem 2: "I keep making the same mistakes"

**Pain**: The user repeatedly fails certain questions but has no visibility into these patterns. The same mistakes persist across sessions.

**Engine Solution**: Question Weakness tracks error frequency and streak recovery. Trap Detection identifies questions where the user has topic mastery but repeatedly fails — indicating misleading wording that requires special attention.

### Problem 3: "I don't know if I'm ready for the exam"

**Pain**: The user has no objective measure of readiness. They guess based on gut feeling, leading to either over-studying or premature exam attempts.

**Engine Solution**: Exam Readiness Score combines category mastery (40%), recent simulacro performance (40%), and weakness recovery trend (20%) into a single 0–100 readiness metric with four clear levels.

### Problem 4: "I can't see my progress over time"

**Pain**: Each practice session feels disconnected. The user cannot see whether they are improving, plateauing, or regressing.

**Engine Solution**: Attempt history with per-attempt scores, combined with telemetry trends (consecutiveCorrect, totalSeen, avgResponseTimeMs), provides longitudinal progress data. The recovery rate signal measures improvement trajectory.

### Problem 5: "I don't understand why I get questions wrong"

**Pain**: After failing a question, the user doesn't get meaningful feedback. They move on without understanding the underlying concept.

**Engine Solution**: Every question includes `feedback.cita_literal` (the legal citation) and `feedback.explicacion_fallo` (why the wrong answer is wrong). This data is already rendered during free mode sessions. Additionally, difficulty and trap classification help contextualize failures.

### Problem 6: "Practice sessions feel repetitive or unfocused"

**Pain**: If the user only does free mode, they see all questions equally. There's no intelligent prioritization.

**Engine Solution**: The adaptive review engine applies a sophisticated selection algorithm: 60% weakest questions, 30% medium-weakness, 10% random/unseen, with mastery-based boosting, cooldown scheduling, and difficulty adjustment. Each review session is unique and targeted.

---

## Section 3 — Product Feature Proposals

### Feature 1: Category Mastery Dashboard

| Attribute         | Value                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| **Purpose**       | Show the user their mastery level across all exam categories at a glance                       |
| **User Value**    | Immediately answers "what should I study next?" by highlighting weak and learning categories   |
| **Data Source**   | `ExamLibraryController.getCategoryMastery(examId)` → `CategoryMastery[]`                       |
| **UI Complexity** | Medium — requires a per-category horizontal bar or card layout with color-coded mastery levels |
| **Priority**      | **P0 — Critical** — This is the highest-value insight with the clearest user benefit           |

### Feature 2: Exam Readiness Indicator

| Attribute         | Value                                                                              |
| ----------------- | ---------------------------------------------------------------------------------- |
| **Purpose**       | Provide a single, clear answer to "am I ready for the real exam?"                  |
| **User Value**    | Reduces anxiety and over/under-preparation. Gives a concrete target to work toward |
| **Data Source**   | `ExamLibraryController.getExamReadiness()` → `ExamReadiness`                       |
| **UI Complexity** | Low — single gauge/score display with color-coded level                            |
| **Priority**      | **P0 — Critical** — The most asked question by any exam candidate                  |

### Feature 3: Weak Questions List

| Attribute         | Value                                                                                                             |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Purpose**       | Show the user specifically which questions they struggle with most                                                |
| **User Value**    | Enables targeted study. User can read the feedback for their worst questions without re-taking exams              |
| **Data Source**   | `computeWeakScore()` applied to all telemetry entries, sorted descending. Question text + feedback from exam data |
| **UI Complexity** | Medium — sortable/filterable list with weakness score, difficulty badge, and expandable feedback                  |
| **Priority**      | **P1 — High** — Complements category mastery with question-level granularity                                      |

### Feature 4: Trap Question Warnings

| Attribute         | Value                                                                                         |
| ----------------- | --------------------------------------------------------------------------------------------- |
| **Purpose**       | Alert the user to "trick questions" that they keep failing despite understanding the topic    |
| **User Value**    | Helps the user focus on question wording rather than topic comprehension. Reduces frustration |
| **Data Source**   | `ExamLibraryController.getTrapSignals(examId)` → `TrapSignal[]`                               |
| **UI Complexity** | Low — badge/icon overlay on question list items + dedicated trap report screen                |
| **Priority**      | **P1 — High** — Unique insight that no competitor provides                                    |

### Feature 5: Adaptive Review Insights

| Attribute         | Value                                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| **Purpose**       | Show the user what the review engine is doing — why specific questions were selected                |
| **User Value**    | Builds trust in the adaptive system. Helps the user understand their learning path                  |
| **Data Source**   | `ReviewQuestion[]` from `selectReviewQuestions()` — includes weakness scores and selection metadata |
| **UI Complexity** | Low — summary card before/after review showing question distribution and weakness breakdown         |
| **Priority**      | **P2 — Medium** — Educational but not essential for core functionality                              |

### Feature 6: Progress Timeline

| Attribute         | Value                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| **Purpose**       | Visualize performance trends over time (scores per attempt, mastery evolution)                         |
| **User Value**    | Motivation and validation. Users can see tangible improvement or identify plateaus                     |
| **Data Source**   | `Attempt[]` from storage (createdAt, result.percentage, type). `QuestionTelemetry` for recovery trends |
| **UI Complexity** | High — requires a chart/graph component (line chart or area chart over time)                           |
| **Priority**      | **P2 — Medium** — High user value but higher implementation cost                                       |

### Feature 7: Question Difficulty Distribution

| Attribute         | Value                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------ |
| **Purpose**       | Show the breakdown of easy/medium/hard questions across an exam                            |
| **User Value**    | Helps set expectations. Users understand that some failures are expected on hard questions |
| **Data Source**   | `ExamLibraryController.getQuestionDifficulty(examId)` → `QuestionDifficulty[]`             |
| **UI Complexity** | Low — three-segment bar or pie showing easy/medium/hard distribution                       |
| **Priority**      | **P2 — Medium** — Contextualizes performance but less actionable than mastery              |

### Feature 8: Study Session Recommendations

| Attribute         | Value                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------- |
| **Purpose**       | Suggest the optimal next action: review weak topics, take a simulacro, or rest         |
| **User Value**    | Eliminates decision paralysis. Guides the user through an optimal study path           |
| **Data Source**   | Composite: Exam Readiness level + Category Mastery distribution + last attempt recency |
| **UI Complexity** | Medium — recommendation card with contextual messaging based on user state             |
| **Priority**      | **P1 — High** — Directly solves "what should I do next?"                               |

### Priority Summary

| Priority          | Features                                                                      |
| ----------------- | ----------------------------------------------------------------------------- |
| **P0 — Critical** | Category Mastery Dashboard, Exam Readiness Indicator                          |
| **P1 — High**     | Weak Questions List, Trap Question Warnings, Study Session Recommendations    |
| **P2 — Medium**   | Adaptive Review Insights, Progress Timeline, Question Difficulty Distribution |

---

## Section 4 — Information Architecture

### Proposed Navigation Structure

```
Home (Landing)
├── Continue Training (smart action)
│   └── [Recommendation engine: review/simulacro/rest]
├── Exam Readiness (global gauge)
│   └── Readiness Score + Level breakdown
└── Quick Stats (weak categories, recent score)

Practice
├── Select Exam
│   ├── Free Mode
│   ├── Simulacro
│   └── Adaptive Review
├── Active Session
│   └── Question → Answer → Feedback → Next
└── Results
    ├── Score Summary
    ├── Question Review
    └── Score Comparison (last/best)

Insights
├── Category Mastery
│   ├── Per-category mastery bars (weak/learning/mastered)
│   ├── Category accuracy stats
│   └── Per-category question drill-down
├── Weak Questions
│   ├── Sorted by weakness score
│   ├── Difficulty badge per question
│   ├── Expandable feedback (citation + explanation)
│   └── Filter by category
├── Trap Questions
│   ├── Confirmed traps (with category context)
│   ├── Possible traps
│   └── Per-question feedback + wording review
├── Question Difficulty
│   ├── Difficulty distribution (easy/medium/hard)
│   └── Filterable question list by difficulty level
└── Progress
    ├── Score trend over time (per attempt type)
    ├── Mastery evolution
    └── Recovery rate

Library
├── Exams
│   ├── Folder organization
│   ├── Per-exam stats (attempts, last score, best score)
│   ├── Import / Export / Delete
│   └── Exam detail → Categories, Question count
├── Categories (cross-exam aggregate view)
│   └── All categories across exams with aggregate mastery
└── Settings
    ├── Language (en/es)
    ├── Backup / Restore
    ├── Clear Data
    └── Advanced (weight configuration)
```

### Navigation Logic

**Primary User Flow (Training-Centric)**:

1. **Home** → User sees readiness score and a recommendation for what to do next
2. **Home → Continue Training** → Launches recommended mode (review if weak areas exist, simulacro if learning, rest suggestion if recently active)
3. **Practice → Select Exam → Mode** → Standard exam selection flow
4. **Practice → Results → Insights** → Post-attempt link to relevant insights

**Secondary Flow (Analytics-Centric)**:

1. **Insights → Category Mastery** → Identify weak categories
2. **Category → Drill-down** → See specific weak questions in that category
3. **Weak Question → Feedback** → Read citation and explanation

**Tab-Based Navigation**:

```
┌────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐
│  Home  │  │ Practice │  │ Insights │  │ Library │
└────────┘  └──────────┘  └──────────┘  └─────────┘
```

- **Home**: Landing page with readiness gauge, recommendations, and quick stats
- **Practice**: Exam selection, mode configuration, attempt execution, results
- **Insights**: All analytical views (mastery, weakness, traps, progress)
- **Library**: Exam management (import/export/delete/organize)

### URL-Less Routing (SPA)

Since the app is a single-page client-side application without a backend, navigation is state-driven:

```typescript
type AppView =
  | "home"
  | "library"
  | "library:examDetail"
  | "attemptConfig"
  | "attemptExecution"
  | "results"
  | "insights"
  | "insights:categoryMastery"
  | "insights:weakQuestions"
  | "insights:trapQuestions"
  | "insights:progress"
  | "settings";
```

---

## Section 5 — Key UI Components

### Component 1: Mastery Bar

| Attribute           | Description                                                                                                                                                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Purpose**         | Visually represent the mastery level of a single category                                                                                                                                                                                   |
| **Data Used**       | `CategoryMastery.level` ("weak" / "learning" / "mastered"), `CategoryMastery.accuracy`, `CategoryMastery.weaknessScore`                                                                                                                     |
| **Visual Behavior** | Horizontal bar with three color states: red (weak), amber (learning), green (mastered). Bar fill represents accuracy (0–100%). Category name label on the left, accuracy percentage on the right. Tooltip or expansion shows weakness score |

### Component 2: Exam Readiness Gauge

| Attribute           | Description                                                                                                                                                                                                                                                                                                            |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Purpose**         | Display the overall exam readiness score as a prominent visual indicator                                                                                                                                                                                                                                               |
| **Data Used**       | `ExamReadiness.readinessScore` (0–100), `ExamReadiness.readinessLevel`                                                                                                                                                                                                                                                 |
| **Visual Behavior** | Circular or semicircular gauge with the score in the center. Four color zones: red (0–40, not_ready), orange (40–60, almost_ready), blue (60–80, ready), green (80–100, exam_ready). Status label below the gauge. Breakdown tooltip showing the three sub-scores: category mastery, simulacro accuracy, recovery rate |

### Component 3: Weakness Score Badge

| Attribute           | Description                                                                                                                                                                         |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Purpose**         | Display the weakness score for a single question in a compact format                                                                                                                |
| **Data Used**       | `computeWeakScore()` result                                                                                                                                                         |
| **Visual Behavior** | Numeric badge with background color intensity proportional to score. Low scores (≤1) are green/muted, moderate (1–3) are amber, high (≥3) are red. Appears inline in question lists |

### Component 4: Difficulty Badge

| Attribute           | Description                                                                                                                      |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Purpose**         | Show the difficulty classification of a question                                                                                 |
| **Data Used**       | `QuestionDifficulty.difficultyLevel` ("easy" / "medium" / "hard")                                                                |
| **Visual Behavior** | Small pill-shaped badge with text and color: green "Easy", amber "Medium", red "Hard". Appears next to question numbers in lists |

### Component 5: Trap Warning Indicator

| Attribute           | Description                                                                                                                                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Purpose**         | Alert the user that a question is flagged as a potential trap                                                                                                                                                                                           |
| **Data Used**       | `TrapSignal.trapLevel` ("none" / "possible" / "confirmed")                                                                                                                                                                                              |
| **Visual Behavior** | Icon-based indicator: no icon for "none", yellow warning triangle for "possible", red warning triangle for "confirmed". Appears next to question numbers. In expanded view, shows trap score and the category mastery context that triggered the signal |

### Component 6: Recommendation Card

| Attribute           | Description                                                                                                                                                                                                                                                                |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Purpose**         | Display a contextual recommendation for the user's next action                                                                                                                                                                                                             |
| **Data Used**       | Composite: `ExamReadiness.readinessLevel`, `CategoryMastery[]` (count of weak/learning), last attempt recency                                                                                                                                                              |
| **Visual Behavior** | Card with icon, title, description, and action button. Example states: "Review Weak Topics" (if many weak categories), "Take a Simulacro" (if mastery is decent but readiness needs exam practice), "You're Ready!" (if exam_ready), "Import an Exam" (if no exams loaded) |

### Component 7: Progress Sparkline

| Attribute           | Description                                                                                                                                                                                               |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Purpose**         | Compact visualization of score trend over recent attempts                                                                                                                                                 |
| **Data Used**       | Last N `Attempt.result.percentage` values                                                                                                                                                                 |
| **Visual Behavior** | Small inline line chart (sparkline) showing the last 5–10 attempt scores. Trend direction indicated by color: upward trend = green, downward = red, flat = neutral. Used in exam cards and home dashboard |

### Component 8: Category Mastery Grid

| Attribute           | Description                                                                                                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Purpose**         | Overview of all categories with their mastery status in a grid/heatmap format                                                                                                                                       |
| **Data Used**       | `CategoryMastery[]` — all categories with level and accuracy                                                                                                                                                        |
| **Visual Behavior** | Grid of category cards, each colored by mastery level. Cards show category name, accuracy %, and question count. Clickable to drill into category detail. Sort options: alphabetical, by mastery level, by accuracy |

### Component 9: Feedback Panel (Tarjeta Roja)

| Attribute           | Description                                                                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Purpose**         | Display detailed feedback after answering a question incorrectly                                                                                                                                       |
| **Data Used**       | `Question.feedback.cita_literal`, `Question.feedback.explicacion_fallo`, `Question.articulo_referencia`                                                                                                |
| **Visual Behavior** | Red-accented panel showing: reference article header, literal citation in a blockquote, explanation text. Used both in attempt execution (immediate feedback) and in insights drill-down (review mode) |

### Component 10: Difficulty Distribution Bar

| Attribute           | Description                                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Purpose**         | Show the easy/medium/hard distribution for an exam                                                              |
| **Data Used**       | `QuestionDifficulty[]` — count per level                                                                        |
| **Visual Behavior** | Stacked horizontal bar with three segments (green/amber/red). Percentage labels. Appears on exam detail screens |

---

## Section 6 — Analytics Views

### View 1: Category Mastery Screen

**What it shows**:

- Full list of categories sorted by mastery level (weak first) or alphabetically
- Per-category: mastery bar, accuracy percentage, weakness score, question count
- Aggregate stats: total categories, count per mastery level (N mastered, N learning, N weak)
- Filter/sort controls: by level, by accuracy, by category name

**Data flow**: `ExamLibraryController.getCategoryMastery(examId)` → `CategoryMastery[]`

**User action**: Click a category to see the individual questions within it, with their weakness scores and feedback.

### View 2: Weak Questions Screen

**What it shows**:

- Questions sorted by weakness score (highest first)
- Per-question: question number, question text (truncated), weakness score badge, difficulty badge, trap indicator
- Expandable: full question text, feedback panel (citation + explanation), answer options with correct answer highlighted
- Filter controls: by category, by difficulty, by trap status
- Search: text search across question text

**Data flow**: All telemetry → `computeWeakScore()` per question → sort descending. Cross-reference with exam questions for text and feedback.

**User action**: Expand a question to read the feedback and understand why they keep getting it wrong.

### View 3: Trap Question Report

**What it shows**:

- Only questions with trapLevel === "possible" or "confirmed"
- Per-question: trap level badge, trap score, the category it belongs to and its mastery level
- Context: "You have mastered [Category X], but you keep failing this question"
- Feedback panel for each trap question

**Data flow**: `ExamLibraryController.getTrapSignals(examId)` → filter `TrapSignal[]` where `trapLevel !== "none"`

**User action**: Study the specific wording of trap questions. Understand what makes them tricky.

### View 4: Exam Readiness Screen

**What it shows**:

- Large readiness gauge (0–100)
- Readiness level label (not_ready / almost_ready / ready / exam_ready)
- Breakdown of the three sub-scores:
  - Category Mastery score (0–100, weighted 40%)
  - Recent Simulacro Accuracy (0–100, weighted 40%)
  - Weakness Recovery Rate (0–100, weighted 20%)
- Recommendation: what to improve to increase readiness
- History: readiness trend over time (if tracked via periodic snapshots)

**Data flow**: `ExamLibraryController.getExamReadiness()` → `ExamReadiness`. Sub-scores from `computeAvgCategoryMastery()`, `computeRecentSimulacroAccuracy()`, `computeWeaknessRecoveryRate()`.

**User action**: Understand which component of readiness needs work. If simulacro accuracy is low → take more simulacros. If mastery is low → do more reviews.

### View 5: Question Difficulty Screen

**What it shows**:

- Difficulty distribution chart (easy/medium/hard percentages)
- Full question list sortable by difficulty score
- Per-question: difficulty badge, total times seen, failure rate
- Group view: questions grouped by difficulty level

**Data flow**: `ExamLibraryController.getQuestionDifficulty(examId)` → `QuestionDifficulty[]`

**User action**: Understand the exam's difficulty profile. Focus on hard questions if aiming for a high score.

### View 6: Progress Screen

**What it shows**:

- Score trend chart: line graph of attempt scores over time, color-coded by attempt type (free/simulacro/review)
- Attempt history table: date, type, score, question count
- Mastery evolution: category mastery snapshots over time (requires periodic computation or derivation from attempts)
- Recovery rate trend: whether the user is improving on weak questions

**Data flow**: `Attempt[]` from storage → sorted by `createdAt`. Per-attempt `result.percentage` for scores. `QuestionTelemetry` for recovery rate calculations.

**User action**: Validate that study effort is producing results. Identify plateaus.

---

## Section 7 — Implementation Strategy

### Phase 11 — Home Dashboard & Readiness Gauge

**Scope**: Home screen with Exam Readiness gauge, quick stats (weak categories count, recent score), and study recommendation card.

**Why first**: Gives immediate value on app launch. Users see their readiness score without navigating anywhere. The recommendation card guides their next action. Depends on existing controller methods (`getExamReadiness()`, `getCategoryMastery()`).

**Deliverables**:

- Home view component
- Readiness gauge component
- Recommendation card component
- View routing update (add "home" as default view)

### Phase 12 — Category Mastery UI

**Scope**: Full Category Mastery screen with mastery bars, accuracy stats, and category drill-down.

**Why second**: Most actionable insight. After seeing readiness score, users want to know which categories need work. Builds directly on Phase 11's home dashboard.

**Deliverables**:

- Category Mastery grid/list component
- Mastery bar component
- Category detail drill-down (questions in category)
- Navigation from home → insights → category mastery

### Phase 13 — Weak Questions & Question Analytics

**Scope**: Weak Questions list with weakness/difficulty badges, trap indicators, and expandable feedback.

**Why third**: Question-level granularity complements category-level mastery. Users identified their weak categories in Phase 12 and now want to see which specific questions are problematic.

**Deliverables**:

- Weak Questions list component
- Weakness badge component
- Difficulty badge component
- Feedback panel (reusable from existing practice mode)
- Filter/sort controls

### Phase 14 — Trap Question Report

**Scope**: Dedicated trap question view + trap indicators in question lists.

**Why fourth**: Trap detection is a unique, high-value feature but lower priority than general weakness visibility. Adding trap badges to existing question lists (Phase 13) is incremental.

**Deliverables**:

- Trap warning indicator component
- Trap question report view
- Integration of trap badges into weak questions list

### Phase 15 — Progress Analytics & Timeline

**Scope**: Score trend chart, attempt history, mastery evolution.

**Why fifth**: Progress tracking is high-value but high-implementation-cost (charts). Requires the most UI complexity. By this point, the user has comprehensive real-time insights; progress adds the longitudinal dimension.

**Deliverables**:

- Progress sparkline component (lightweight, no library)
- Score trend chart (canvas-based or SVG)
- Attempt history list
- Integration of sparklines into exam cards

### Phase 16 — Navigation Overhaul & Information Architecture

**Scope**: Implement tab-based navigation (Home / Practice / Insights / Library), view routing system, and responsive layout.

**Why last in the feature sequence**: Navigation should wrap around completed features. Building navigation before features exist creates empty shells. This phase unifies all previous work into a cohesive product.

**Note**: Lightweight navigation updates should happen incrementally (Phase 11 adds "Home", Phase 12 adds "Insights" shell). Phase 16 is the final polish and consolidation.

**Deliverables**:

- Tab bar component
- View router
- Responsive layout adjustments
- Screen transition animations (optional)

### Phase Summary

| Phase | Name                       | Priority | Complexity | Dependencies                  |
| ----- | -------------------------- | -------- | ---------- | ----------------------------- |
| 11    | Home Dashboard & Readiness | P0       | Medium     | None (engine complete)        |
| 12    | Category Mastery UI        | P0       | Medium     | Phase 11 (navigation)         |
| 13    | Weak Questions & Analytics | P1       | Medium     | Phase 12 (insights section)   |
| 14    | Trap Question Report       | P1       | Low        | Phase 13 (question list)      |
| 15    | Progress Analytics         | P2       | High       | Phases 11–14 (data available) |
| 16    | Navigation & IA Polish     | P1       | Medium     | All previous phases           |

---

## Section 8 — Constraints

### Architectural Constraints (from AGENTS.md)

| Constraint                     | Impact on UX Design                                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Fully client-side**          | All analytics computed in-browser. No server-side aggregation or pre-computation. Performance must be considered for large exam sets |
| **Local-first (IndexedDB)**    | Data is only on the user's device. No cross-device sync. Backup/restore is the only data portability mechanism                       |
| **Deterministic domain logic** | All signals (weakness, mastery, readiness) are reproducible. UI can safely cache and re-render without inconsistency                 |
| **No backend dependencies**    | No user accounts, no cloud storage, no remote analytics. Privacy is guaranteed                                                       |
| **Static hosting**             | SPA routing must use hash-based or state-based navigation. No server-side rendering                                                  |
| **No framework migration**     | All UI must be built with vanilla TypeScript + DOM APIs. No React, Vue, or other frameworks                                          |
| **Strict TypeScript**          | All view state types must be strictly typed. No `any` types in component data flow                                                   |

### Performance Constraints

| Concern                                                     | Mitigation                                                                                                           |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Computing mastery/weakness for large exams (500+ questions) | Computations are O(n) per question. Acceptable for client-side. Cache results and recompute only on telemetry change |
| Rendering large question lists                              | Virtual scrolling or pagination for lists > 100 items                                                                |
| Chart rendering without a library                           | Canvas-based or SVG sparklines. Avoid heavy charting libraries to maintain zero-build-dependency philosophy          |
| IndexedDB read latency                                      | Batch reads using existing controller methods. Display loading states for async operations                           |

### UX Constraints

| Constraint          | Impact                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **No external CDN** | Icons must be inline SVG or Unicode characters. No icon font CDN                                                               |
| **i18n (en/es)**    | All user-facing text must go through the translation system. New features require translation keys in both `en.ts` and `es.ts` |
| **Mobile-first**    | The app targets exam candidates who may study on mobile. All layouts must be responsive                                        |
| **Offline-capable** | The app must work with no network connection once loaded. All data and computation is local                                    |

### Data Flow Constraint

```
UI Component
    └── reads → Application Controller method (async)
        └── calls → Domain function (pure, sync)
            └── reads → IndexedDB (via Storage layer)

UI Component
    └── dispatches action → Application Controller method
        └── orchestrates → Domain + Storage
            └── returns → View State (serializable)
```

The UI must **never** import from `src/domain/` or `src/storage/` directly. All data flows through the application layer controllers.

---

## Appendix A — Controller Method Availability

All features in this document can be built using existing controller methods:

| Feature                    | Controller Method                                                           | Status       |
| -------------------------- | --------------------------------------------------------------------------- | ------------ |
| Category Mastery Dashboard | `ExamLibraryController.getCategoryMastery()`                                | ✅ Available |
| Category Stats             | `ExamLibraryController.getCategoryStats()`                                  | ✅ Available |
| Category Weakness          | `ExamLibraryController.getCategoryWeakness()`                               | ✅ Available |
| Question Difficulty        | `ExamLibraryController.getQuestionDifficulty()`                             | ✅ Available |
| Trap Detection             | `ExamLibraryController.getTrapSignals()`                                    | ✅ Available |
| Exam Readiness             | `ExamLibraryController.getExamReadiness()`                                  | ✅ Available |
| Attempt Stats              | `ExamLibraryController.getLibraryViewState()` → `ExamCardView.stats`        | ✅ Available |
| Telemetry Reset            | `ExamLibraryController.resetTelemetry()`                                    | ✅ Available |
| Backup/Restore             | `ExamLibraryController.createBackup()` / `restoreBackup()`                  | ✅ Available |
| Attempt Execution          | `AttemptController.startAttempt()` / `submitAnswer()` / `finalizeAttempt()` | ✅ Available |

No new domain or application layer code is required to implement the proposed features. The engine is complete; only the presentation layer needs to be built.

## Appendix B — View State Types Needed

New view state types that should be added to `src/application/viewState.ts` as the UI is built:

```typescript
// Insights view state types (to be created in implementation phases)

interface CategoryMasteryViewState {
  categories: CategoryMastery[];
  summary: {
    total: number;
    mastered: number;
    learning: number;
    weak: number;
  };
}

interface WeakQuestionsViewState {
  questions: Array<{
    questionNumber: number;
    questionText: string;
    weaknessScore: number;
    difficultyLevel: "easy" | "medium" | "hard";
    trapLevel: "none" | "possible" | "confirmed";
    categories: string[];
    feedback: {
      referenceArticle: string;
      literalCitation: string;
      explanation: string;
    };
  }>;
  filters: {
    category?: string;
    difficultyLevel?: "easy" | "medium" | "hard";
    trapOnly?: boolean;
  };
}

interface ExamReadinessViewState {
  readinessScore: number;
  readinessLevel: "not_ready" | "almost_ready" | "ready" | "exam_ready";
  breakdown: {
    categoryMasteryScore: number;
    simulacroAccuracyScore: number;
    recoveryRateScore: number;
  };
}

interface ProgressViewState {
  attempts: Array<{
    id: string;
    type: "free" | "simulacro" | "review";
    createdAt: string;
    percentage: number;
  }>;
  recoveryRate: number;
}

interface StudyRecommendation {
  action: "review" | "simulacro" | "rest" | "import_exam";
  title: string;
  description: string;
  examId?: string;
}
```

These types will be formalized during implementation phases.
