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

---

## [002] Source-type toggle in the AI Prompt Generator modal

**Module:** `index.html`, `src/core/controllers/LibraryFlowController.ts`, `src/i18n/en.ts`, `src/i18n/es.ts`, `src/ui/updatePageText.ts`

**Description:** The AI Prompt Generator modal currently assumes the user always works from _study material_ they wrote themselves. A second common workflow is converting an _official exam with an existing answer key_ into the GinaXams JSON format — in that case the AI must transcribe and mirror all questions verbatim rather than invent new ones. Add a two-option toggle (styled radio group) at the top of the modal form that lets the user choose between these two source types. The toggle must drive two distinct behaviors:

1. **Study material** (default — existing behavior): the prompt opens with `aiPromptBody` ("Based on the following study material…"), keeps the _Number of questions_, _Answers per question_, and _Difficulty_ fields visible, and uses `aiPromptRules`.
2. **Official exam (with answers)**: the prompt opens with a new `aiPromptBodyExam` intro ("Based on the following official exam and its answer key, your task is to transcribe and structure ALL questions exactly as they appear in the original document."), **hides** the _Number of questions_, _Answers per question_, and _Difficulty_ fields (they are irrelevant — the AI must include every question from the source), and uses a new `aiPromptRulesExam` ruleset that enforces verbatim transcription and full inclusion.

**Exact files to touch (no others):**

1. **`src/i18n/en.ts`** — Add the following keys (place them in the `// AI Prompt Generator` block, after the existing `aiPromptRules` key):
   - `sourceTypeLabel: "Source Type"`
   - `sourceTypeStudyMaterial: "Study Material"`
   - `sourceTypeOfficialExam: "Official Exam (with answers)"`
   - `aiPromptBodyExam: "Based on the following official exam and its answer key, your task is to transcribe and structure ALL questions exactly as they appear in the original document."`
   - `aiPromptRulesExam` (multiline template literal):
     ```
     IMPORTANT REQUIREMENTS:
     1. Include ALL questions from the source document, without exception — do NOT skip any
     2. Transcribe question text verbatim — do NOT rephrase or rewrite
     3. Transcribe answer options exactly as they appear in the source
     4. Use the answer key to set exactly ONE "isCorrect": true per question
     5. For feedback.cita_literal: quote the relevant law article or provide a technical definition
     6. For feedback.explicacion_fallo: write a brief explanation of why the correct answer is right
     7. The total_questions field must equal the exact count of questions transcribed
     8. Return ONLY valid JSON, no markdown formatting or explanations
     9. Escape ALL line breaks in text strings as \n — never use literal line breaks inside strings
     ```

2. **`src/i18n/es.ts`** — Add the same keys with Spanish translations (same location):
   - `sourceTypeLabel: "Tipo de fuente"`
   - `sourceTypeStudyMaterial: "Material de estudio"`
   - `sourceTypeOfficialExam: "Examen oficial (con respuestas)"`
   - `aiPromptBodyExam: "Basándome en el siguiente examen oficial y su plantilla de respuestas, tu tarea es transcribir y estructurar TODAS las preguntas exactamente como aparecen en el documento original."`
   - `aiPromptRulesExam` (multiline template literal, Spanish):
     ```
     REQUISITOS IMPORTANTES:
     1. Incluye TODAS las preguntas del documento fuente, sin excepción — no omitas ninguna
     2. Transcribe el texto de cada pregunta literalmente — NO reformules ni reescribas
     3. Transcribe las opciones de respuesta exactamente como aparecen en la fuente
     4. Usa la plantilla de respuestas para asignar exactamente UN "isCorrect": true por pregunta
     5. En feedback.cita_literal: cita el artículo de ley correspondiente o la definición técnica
     6. En feedback.explicacion_fallo: escribe una breve explicación de por qué la respuesta correcta es la correcta
     7. El campo total_questions debe ser igual al número exacto de preguntas transcritas
     8. Devuelve SOLO el JSON, sin formato markdown ni explicaciones
     9. Escapa TODOS los saltos de línea en cadenas de texto como \n — nunca uses saltos de línea literales dentro de strings
     ```

3. **`index.html`** — In the `#aiPromptModal` form (`.ai-prompt-form`), insert a new `div.ai-prompt-field` with id `aiSourceTypeField` as the **first** child of `.ai-prompt-form`, before the exam-name field. It must contain:
   - A `<label>` with `id="txtSourceTypeLabel"` (text: "Source Type")
   - A `<div class="ai-source-toggle">` containing two `<button>` elements:
     - `id="btnSourceStudyMaterial"`, `class="ai-source-btn active"`, `data-testid="source-type-study"`, `onclick="window.app.setSourceType('study')"`, text element `id="txtSourceTypeStudyMaterial"`
     - `id="btnSourceOfficialExam"`, `class="ai-source-btn"`, `data-testid="source-type-exam"`, `onclick="window.app.setSourceType('exam')"`, text element `id="txtSourceTypeOfficialExam"`
   - Wrap the three generation-specific fields (`aiNumQuestionsField`, `aiNumAnswersField`, `aiDifficultyField`) in a `<div id="aiStudyMaterialFields">` so they can be shown/hidden as a unit. Give each inner `div.ai-prompt-field` a matching `id`: `aiNumQuestionsField`, `aiNumAnswersField`, `aiDifficultyField`.

4. **`src/core/controllers/LibraryFlowController.ts`** — In `generateAIPrompt()`:
   - Read the active source type from whichever button has class `active` among `#btnSourceStudyMaterial` / `#btnSourceOfficialExam`, or read a data attribute (implementation detail — pick the simpler approach).
   - If source type is `"exam"`, use `T.aiPromptBodyExam` as the body (no `{numQuestions}`/`{numAnswers}`/`{letters}` substitutions needed) and `T.aiPromptRulesExam` as the rules.
   - If source type is `"study"`, keep the existing logic unchanged.
   - Add a `setSourceType(type: "study" | "exam"): void` method that: toggles the `active` class between the two buttons, and shows/hides `#aiStudyMaterialFields` (`classList.remove("hidden")` for study, `classList.add("hidden")` for exam).
   - Expose `setSourceType` on `LibraryFlowController` and wire it through `app.ts` as `setSourceType(type: string): void` (cast to `"study" | "exam"` inside the controller).
   - Reset the toggle to `"study"` (re-show fields, restore `active` on study button) inside `showAIPromptGenerator()` so reopening the modal always starts in study-material mode.

5. **`src/ui/updatePageText.ts`** — Add `setText` calls for the three new label IDs:
   - `setText("txtSourceTypeLabel", T.sourceTypeLabel)`
   - `setText("txtSourceTypeStudyMaterial", T.sourceTypeStudyMaterial)`
   - `setText("txtSourceTypeOfficialExam", T.sourceTypeOfficialExam)`

**Constraints:**

- Do NOT modify `src/domain/types.ts`, `src/domain/defaults.ts`, `src/storage/db.ts`, or `AGENTS.md`.
- Do NOT touch `practice/lang/en.js` or `practice/lang/es.js` (legacy standalone tool — out of scope).
- The toggle must be two visually distinct buttons (not a native `<select>`), styled with `class="ai-source-toggle"` / `class="ai-source-btn"` — no new CSS classes need to be invented beyond those names; the task executor must add minimal inline styles if needed or rely on existing `.btn` patterns.
- Existing behavior for study-material mode must be unchanged.
- The `data-testid` attributes on the toggle buttons are the E2E contract — do not omit them.

**Acceptance Criteria:**

- The modal shows a "Source Type" toggle with two options as its first field.
- Default selection is "Study Material"; the three generation fields (num questions, num answers, difficulty) are visible.
- Selecting "Official Exam (with answers)" hides those three fields.
- Switching back to "Study Material" restores them.
- Generating a prompt in study-material mode produces the same output as before this change.
- Generating a prompt in official-exam mode produces a prompt that begins with `aiPromptBodyExam` and uses `aiPromptRulesExam` (does not mention num questions or difficulty).
- Closing and reopening the modal resets the toggle to "Study Material".
- Language switching (EN ↔ ES) correctly updates all toggle labels.
- `npm test` passes (no unit test regressions).
- Browser MCP: navigate to `http://localhost:3000`, open the AI Prompt Generator, confirm both `data-testid="source-type-study"` and `data-testid="source-type-exam"` are present, click exam mode and confirm the three fields are hidden, generate a prompt and confirm the output starts with the exam intro text.

**Risk:** medium
