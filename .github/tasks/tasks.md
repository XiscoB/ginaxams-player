# Task Backlog

Tasks are executed one at a time via the `master_prompt.md` TASK EXECUTION PROTOCOL.

**How to trigger a task:**

Paste the following block (with the desired task number) into the chat along with the full contents of `master_prompt.md`:

```
TASK TO EXECUTE NOW: read the file in .github/tasks/tasks.md and focus only and exclusively in solving the next task:
[TASK_NUMBER] = 001
```

---

## [001] Question count selector for Simulacro and Repasar Todo

**Module:** `src/ui/views/AttemptConfigView.ts`, `src/core/controllers/AttemptFlowController.ts`
**Description:** Both the Simulacro and Repasar Todo (review) mode cards in the attempt config screen must allow the user to choose how many questions to include in the attempt, up to the maximum the selected exam contains. Currently, Simulacro hardcodes `questionCount: 60` in the controller and there is no selector exposed in the UI; Repasar Todo passes `config: undefined`, which falls back to the default of 60. The fix requires threading the exam's question count (`ExamCardView.questionCount`) through to the config view and adding a `<select>` element to each mode card that generates options in steps of 10 (e.g. 10, 20, …, `totalQuestions`), defaulting to `totalQuestions`.

**Exact files to touch (no others):**

1. `src/core/controllers/AttemptFlowController.ts`
   - Add `totalQuestions: number` to the `PendingAttempt` interface.
   - In `selectExam()`: store `exam.questionCount` in `pendingAttempt.totalQuestions`.
   - In `showAttemptConfigScreen()`: always destroy and recreate the config screen so question-count options are correct when the user selects a different exam. Call `removeAttemptConfigScreen()` before the `createAttemptConfigScreen()` call (remove the `if (!configScreen)` guard).
   - Pass `this.pendingAttempt.totalQuestions` as the third argument to `createAttemptConfigScreen()`.
   - In `startAttempt()` for `mode === "simulacro"`: read `#simulacroQuestionCountSelect` and pass its value as `config.questionCount` (replacing the hardcoded `60`).
   - In `startAttempt()` for `mode === "review"`: read `#reviewQuestionCountSelect` and pass `{ reviewQuestionCount: N }` as `config` (currently `undefined`).

2. `src/ui/views/AttemptConfigView.ts`
   - Add `totalQuestions: number` as a third parameter to `createAttemptConfigScreen()`.
   - Extract a helper (local function or inline) that generates `<option>` elements from 10 to `totalQuestions` in steps of 10, always including `totalQuestions` itself, with `totalQuestions` selected by default.
   - Add a `<select id="simulacroQuestionCountSelect">` labelled with `T.questionCountLabel` inside the simulacro card's `mode-card__config` block, above the existing timer select.
   - Add a `<select id="reviewQuestionCountSelect">` labelled with `T.questionCountLabel` inside the review card, in a new `mode-card__config` block, above the Start button.

**Constraints:**

- Do NOT modify `src/domain/types.ts`, `src/domain/defaults.ts`, `src/storage/db.ts`, or `AGENTS.md`.
- `StartAttemptParams.config.questionCount` (for simulacro) and `StartAttemptParams.config.reviewQuestionCount` (for review) already exist — use them as-is.
- The `T.questionCountLabel` translation key already exists in both `en.ts` and `es.ts` — do not add new keys.
- Style the new selects consistently with the existing `#simulacroTimerSelect` (same inline style).

**Acceptance Criteria:**

- The Simulacro card shows a question-count selector whose options are 10, 20, …, up to the exam's total question count, defaulting to the maximum.
- The Repasar Todo card shows an identical question-count selector.
- Starting a Simulacro with a custom count launches an attempt with exactly that many questions (verify via the question progress counter in the practice screen).
- Starting a Repasar Todo with a custom count respects the count (adaptive selection still applies, but at most N questions are included).
- If the user goes back and selects a different exam, the selectors show the correct maximum for the new exam.
- `npm test` passes (no unit test regressions).
- Browser MCP: navigate to `http://localhost:3000`, import an exam, open the config screen, confirm both selectors are visible and options are correct.

**Risk:** low
