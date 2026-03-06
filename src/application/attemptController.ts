/**
 * AttemptController — Application Orchestration Layer
 *
 * This module is the single boundary between the UI and the domain engine
 * for all attempt-related operations. The UI must never call domain functions
 * directly; it interacts exclusively through this controller.
 *
 * Responsibilities:
 * - Create and persist Attempt records
 * - Instantiate and drive AttemptRunner
 * - Maintain runtime SessionState
 * - Produce serializable AttemptViewState for the UI
 * - Persist telemetry updates after finalization
 * - Coordinate storage ↔ domain
 *
 * Forbidden:
 * - No DOM access
 * - No CSS
 * - No rendering
 * - No localization
 */

import type {
  Attempt,
  AttemptType,
  Question,
  QuestionTelemetry,
  SimulacroAttemptConfig,
  ReviewAttemptConfig,
  AttemptResult,
  SessionAnswerResult,
} from "../domain/types.js";

import { AttemptRunner } from "../domain/attemptRunner.js";
import { createAttempt } from "../domain/attempt.js";
import { getScoreCategory } from "../domain/scoring.js";
import { shuffleArray } from "../domain/scoring.js";
import { selectReviewQuestions } from "../domain/reviewSelection.js";
import { DEFAULTS } from "../domain/defaults.js";

import type { ExamStorage } from "../storage/db.js";

import type {
  AttemptViewState,
  AttemptResultViewState,
  AnswerView,
  AnswerViewWithResult,
  FeedbackView,
  QuestionResultView,
  StartAttemptParams,
} from "./viewState.js";

// ============================================================================
// Session State (internal — never exposed to UI)
// ============================================================================

/**
 * Runtime session state for an active attempt.
 * This lives only in the controller and is never leaked to the UI.
 */
interface SessionState {
  /** The persisted attempt record */
  attempt: Attempt;
  /** The domain AttemptRunner instance */
  runner: AttemptRunner;
  /** All questions for this attempt (pre-shuffled if applicable) */
  questions: Question[];
  /** Source exam ID (primary) */
  primaryExamId: string;
  /** Timestamp (ms) when the session started */
  startedAtMs: number;
  /** Whether to show explanations during simulacro (UI-only, default false) */
  showExplanations: boolean;
}

// ============================================================================
// AttemptController
// ============================================================================

export class AttemptController {
  private storage: ExamStorage;
  private session: SessionState | null = null;

  constructor(storage: ExamStorage) {
    this.storage = storage;
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Start a new attempt.
   *
   * Flow:
   * 1. Load exam(s) from storage
   * 2. Create Attempt record (needed for deterministic seed in review mode)
   * 3. Prepare questions (shuffle for free/simulacro, weakness-sort for review)
   * 4. Persist Attempt record
   * 5. Instantiate AttemptRunner
   * 6. Start the runner
   *
   * @param params - Attempt configuration from the UI
   * @returns Initial view state
   */
  async startAttempt(params: StartAttemptParams): Promise<AttemptViewState> {
    const { mode, examIds, config } = params;

    if (examIds.length === 0) {
      throw new Error("At least one exam ID is required");
    }

    // 1. Load exam data
    const primaryExamId = examIds[0];
    const storedExam = await this.storage.getExam(primaryExamId);
    if (!storedExam) {
      throw new Error(`Exam not found: ${primaryExamId}`);
    }

    const examData = storedExam.data;

    // 2. Create attempt record early (ID needed as seed for review mode)
    const attempt = this.createAttemptRecord(mode, examIds, config);

    // 3. Prepare questions based on mode
    let questions: Question[];

    switch (mode) {
      case "free":
        questions = shuffleArray([...examData.questions]);
        break;

      case "simulacro":
        questions = shuffleArray([...examData.questions]);
        break;

      case "review":
        questions = await this.prepareReviewQuestions(
          examData.questions,
          primaryExamId,
          config,
          attempt.id,
        );
        break;

      default:
        throw new Error(`Unknown attempt mode: ${mode}`);
    }

    // 4. Persist attempt record
    await this.storage.saveAttempt(attempt);

    // 4. Load existing telemetry for the runner
    const telemetryLookup = await this.buildTelemetryLookup(primaryExamId);

    // 5. Instantiate and start runner
    const runnerConfig = this.buildRunnerConfig(mode, config, telemetryLookup);
    const runner = new AttemptRunner(attempt, questions, runnerConfig);
    runner.start();

    // 6. Store session state
    this.session = {
      attempt,
      runner,
      questions,
      primaryExamId,
      startedAtMs: Date.now(),
      showExplanations: config?.showExplanations ?? false,
    };

    return this.getViewState();
  }

  /**
   * Load an existing attempt (e.g., resuming).
   * For now this creates a read-only view of a completed attempt.
   *
   * @param attemptId - The attempt ID to load
   * @returns Result view state if completed, or null
   */
  async loadAttempt(attemptId: string): Promise<AttemptResultViewState | null> {
    const attempt = await this.storage.getAttempt(attemptId);
    if (!attempt || !attempt.result) {
      return null;
    }

    const storedExam = await this.storage.getExam(attempt.sourceExamIds[0]);
    if (!storedExam) {
      return null;
    }

    return this.buildResultViewState(attempt, storedExam.data.questions);
  }

  // ==========================================================================
  // User Actions (dispatched from UI)
  // ==========================================================================

  /**
   * Submit an answer for the current question.
   *
   * @param answerIndex - The selected answer index, or null for blank
   * @returns Updated view state
   */
  submitAnswer(answerIndex: number | null): AttemptViewState {
    this.requireActiveSession();

    this.session!.runner.submitAnswer(answerIndex);
    return this.getViewState();
  }

  /**
   * Move to the next question.
   *
   * @returns Updated view state
   */
  nextQuestion(): AttemptViewState {
    this.requireActiveSession();

    this.session!.runner.next();
    return this.getViewState();
  }

  /**
   * Advance the simulacro timer.
   * Should be called by the application timer at regular intervals.
   *
   * @param deltaMs - Milliseconds elapsed
   * @returns Updated view state
   */
  tick(deltaMs: number): AttemptViewState {
    this.requireActiveSession();

    this.session!.runner.tick(deltaMs);
    return this.getViewState();
  }

  /**
   * Finalize the attempt.
   *
   * Flow:
   * 1. Finish the runner (compute results)
   * 2. Persist telemetry updates (simulacro/review only)
   * 3. Update the attempt record with results
   * 4. Clear session
   *
   * @returns Final result view state
   */
  async finalizeAttempt(): Promise<AttemptResultViewState> {
    this.requireActiveSession();

    const { runner, attempt, questions, startedAtMs } = this.session!;

    // 1. Finish the runner
    runner.finish();
    const finalState = runner.getState();

    // 2. Persist telemetry updates
    if (attempt.type !== "free") {
      const telemetryUpdates = runner.consumeTelemetryUpdates();
      for (const update of telemetryUpdates) {
        await this.storage.saveQuestionTelemetry(update.next);
      }
    }

    // 3. Update attempt with result
    if (finalState.result) {
      const updatedAttempt: Attempt = {
        ...attempt,
        result: finalState.result,
      } as Attempt;
      await this.storage.saveAttempt(updatedAttempt);
    }

    // 4. Build result view with per-question answer data
    const timeSpentMs = Date.now() - startedAtMs;
    const resultView = this.buildResultViewState(
      attempt,
      questions,
      finalState.result,
      finalState.answers,
      timeSpentMs,
    );

    // 5. Clear session
    this.session = null;

    return resultView;
  }

  /**
   * Abort the current attempt without persisting results.
   * Telemetry updates are discarded.
   */
  abortAttempt(): void {
    if (this.session) {
      // Discard telemetry buffer
      this.session.runner.consumeTelemetryUpdates();
      this.session = null;
    }
  }

  // ==========================================================================
  // View State Production
  // ==========================================================================

  /**
   * Produce the current AttemptViewState for the UI.
   * This is the primary output of the controller.
   */
  getViewState(): AttemptViewState {
    this.requireActiveSession();

    const { runner, attempt } = this.session!;
    const state = runner.getState();
    const currentQuestion = state.questions[state.currentIndex];

    if (!currentQuestion) {
      throw new Error("No current question available");
    }

    const answer = state.answers[currentQuestion.number];
    const isAnswered = answer !== undefined;

    // Determine whether to show feedback (suppress in simulacro unless toggle is on)
    const showFeedback =
      attempt.type !== "simulacro" || this.session!.showExplanations;

    // Build answers view (suppress correctness info in simulacro without feedback)
    const answers = showFeedback
      ? this.buildAnswersView(currentQuestion, answer)
      : this.buildAnswersView(currentQuestion);

    // Build feedback
    let feedback: FeedbackView | undefined;
    if (isAnswered && showFeedback) {
      const correctAnswer = currentQuestion.answers.find((a) => a.isCorrect);
      const selectedAnswer =
        answer.selectedIndex !== null
          ? currentQuestion.answers[answer.selectedIndex]
          : null;
      feedback = {
        isCorrect: answer.isCorrect,
        selectedAnswer: selectedAnswer?.letter ?? null,
        correctAnswer: correctAnswer?.letter ?? "?",
        referenceArticle: currentQuestion.articulo_referencia,
        literalCitation: currentQuestion.feedback.cita_literal,
        explanation: currentQuestion.feedback.explicacion_fallo,
      };
    }

    // Build timer info (simulacro only)
    let timer: AttemptViewState["timer"];
    if (attempt.type === "simulacro" && state.remainingTimeMs !== undefined) {
      const totalMs =
        attempt.type === "simulacro"
          ? (attempt as { config: SimulacroAttemptConfig }).config.timeLimitMs
          : 0;
      timer = {
        remainingMs: state.remainingTimeMs,
        totalMs,
      };
    }

    const answeredCount = Object.keys(state.answers).length;
    const isLastQuestion = state.currentIndex >= state.questions.length - 1;

    return {
      mode: attempt.type,
      questionText: currentQuestion.text,
      questionNumber: currentQuestion.number,
      questionCategories: currentQuestion.categoria,
      answers,
      isAnswered,
      selectedAnswerIndex: answer?.selectedIndex ?? null,
      feedback,
      progress: {
        current: state.currentIndex + 1,
        total: state.questions.length,
        answered: answeredCount,
      },
      timer,
      isFinished: state.isFinished,
      canGoPrevious: false, // Forward-only navigation for now
      canGoNext: isAnswered && !isLastQuestion,
      canFinish: isAnswered && isLastQuestion,
    };
  }

  /**
   * Check whether there is an active session.
   */
  hasActiveSession(): boolean {
    return this.session !== null;
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /**
   * Guard: throws if no active session.
   */
  private requireActiveSession(): void {
    if (!this.session) {
      throw new Error("No active attempt session");
    }
  }

  /**
   * Build answer view objects from the current question.
   */
  private buildAnswersView(
    question: Question,
    answer?: { selectedIndex: number | null; isCorrect: boolean },
  ): AnswerView[] | AnswerViewWithResult[] {
    if (answer === undefined) {
      // Not yet answered — plain answer views
      return question.answers.map((a, index) => ({
        letter: a.letter,
        text: a.text,
        index,
      }));
    }

    // Answered — include correctness info
    return question.answers.map(
      (a, index): AnswerViewWithResult => ({
        letter: a.letter,
        text: a.text,
        index,
        isCorrect: a.isCorrect,
        isSelected: answer.selectedIndex === index,
      }),
    );
  }

  /**
   * Build the results view state from a completed attempt.
   *
   * @param attempt - The attempt record
   * @param questions - Questions in the attempt
   * @param result - Computed result (from runner or stored)
   * @param answers - Per-question answer map (from active session)
   * @param timeSpentMs - Time spent on the attempt in milliseconds
   */
  private buildResultViewState(
    attempt: Attempt,
    questions: Question[],
    result?: AttemptResult,
    answers?: Record<number, SessionAnswerResult>,
    timeSpentMs?: number,
  ): AttemptResultViewState {
    const finalResult = result ?? attempt.result;
    if (!finalResult) {
      throw new Error("Cannot build result view: attempt has no result");
    }

    const scoreCategory = getScoreCategory(finalResult.percentage);

    // Build per-question summary
    const questionSummary: QuestionResultView[] = questions.map((q) => {
      const correctAnswer = q.answers.find((a) => a.isCorrect);
      const correctLetter = correctAnswer?.letter ?? "?";
      const correctText = correctAnswer?.text ?? "";

      // Use actual answer data when available (active session)
      const answer = answers?.[q.number];
      if (answer) {
        const selectedLetter =
          answer.selectedIndex !== null
            ? (q.answers[answer.selectedIndex]?.letter ?? null)
            : null;
        return {
          questionNumber: q.number,
          questionText: q.text,
          isCorrect: answer.isCorrect,
          isBlank: answer.selectedIndex === null,
          selectedAnswerLetter: selectedLetter,
          correctAnswerLetter: correctLetter,
          correctAnswerText: correctText,
          referenceArticle: q.articulo_referencia,
          literalCitation: q.feedback.cita_literal,
          explanation: q.feedback.explicacion_fallo,
        };
      }

      // Fallback for loaded attempts without per-question data
      return {
        questionNumber: q.number,
        questionText: q.text,
        isCorrect: false,
        isBlank: true,
        selectedAnswerLetter: null,
        correctAnswerLetter: correctLetter,
        correctAnswerText: correctText,
        referenceArticle: q.articulo_referencia,
        literalCitation: q.feedback.cita_literal,
        explanation: q.feedback.explicacion_fallo,
      };
    });

    return {
      mode: attempt.type,
      result: finalResult,
      totalQuestions: questions.length,
      timeSpentMs: timeSpentMs ?? 0,
      scoreCategory,
      questionSummary,
    };
  }

  /**
   * Prepare review mode questions using weakness-based selection.
   */
  private async prepareReviewQuestions(
    allQuestions: Question[],
    examId: string,
    config: StartAttemptParams["config"] | undefined,
    attemptId: string,
  ): Promise<Question[]> {
    const telemetryList = await this.storage.getTelemetryByExam(examId);

    const weights = {
      wrongWeight: config?.wrongWeight ?? DEFAULTS.wrongWeight,
      blankWeight: config?.blankWeight ?? DEFAULTS.blankWeight,
      recoveryWeight: config?.recoveryWeight ?? DEFAULTS.recoveryWeight,
      weakTimeThresholdMs:
        config?.weakTimeThresholdMs ?? DEFAULTS.weakTimeThresholdMs,
    };

    const count = config?.reviewQuestionCount ?? DEFAULTS.reviewQuestionCount;

    const ratios = {
      weakRatio: config?.reviewWeakRatio ?? DEFAULTS.reviewWeakRatio,
      mediumRatio: config?.reviewMediumRatio ?? DEFAULTS.reviewMediumRatio,
      randomRatio: config?.reviewRandomRatio ?? DEFAULTS.reviewRandomRatio,
    };

    const reviewQuestions = selectReviewQuestions(
      allQuestions,
      telemetryList,
      count,
      weights,
      attemptId,
      ratios,
      config?.masteryWeakBoost != null ||
        config?.masteryLearningBoost != null ||
        config?.masteryMasteredPenalty != null
        ? {
            weakBoost: config?.masteryWeakBoost ?? DEFAULTS.masteryWeakBoost,
            learningBoost:
              config?.masteryLearningBoost ?? DEFAULTS.masteryLearningBoost,
            masteredPenalty:
              config?.masteryMasteredPenalty ?? DEFAULTS.masteryMasteredPenalty,
          }
        : undefined,
      {
        cooldownWindowMs:
          config?.reviewCooldownWindowMs ?? DEFAULTS.reviewCooldownWindowMs,
        cooldownMinMultiplier:
          config?.cooldownMinMultiplier ?? DEFAULTS.cooldownMinMultiplier,
      },
      Date.now(),
    );

    return reviewQuestions.map((rq) => rq.question);
  }

  /**
   * Create the appropriate Attempt record based on mode.
   */
  private createAttemptRecord(
    mode: AttemptType,
    examIds: string[],
    config?: StartAttemptParams["config"],
  ): Attempt {
    switch (mode) {
      case "free":
        return createAttempt("free", examIds);

      case "simulacro":
        return createAttempt("simulacro", examIds, {
          questionCount: config?.questionCount ?? 0,
          timeLimitMs: config?.timeLimitMs ?? 0,
          penalty: config?.penalty ?? 0,
          reward: config?.reward ?? 1,
          examWeights: config?.examWeights ?? {},
        } satisfies SimulacroAttemptConfig);

      case "review":
        return createAttempt("review", examIds, {
          questionCount:
            config?.reviewQuestionCount ?? DEFAULTS.reviewQuestionCount,
          weights: {
            wrongWeight: config?.wrongWeight ?? DEFAULTS.wrongWeight,
            blankWeight: config?.blankWeight ?? DEFAULTS.blankWeight,
            recoveryWeight: config?.recoveryWeight ?? DEFAULTS.recoveryWeight,
            weakTimeThresholdMs:
              config?.weakTimeThresholdMs ?? DEFAULTS.weakTimeThresholdMs,
          },
        } satisfies ReviewAttemptConfig);

      default:
        throw new Error(`Unknown mode: ${mode}`);
    }
  }

  /**
   * Build a TelemetryLookup function backed by pre-loaded data.
   * This avoids async calls inside the synchronous AttemptRunner.
   */
  private async buildTelemetryLookup(
    examId: string,
  ): Promise<
    (examId: string, questionNumber: number) => QuestionTelemetry | undefined
  > {
    const telemetryList = await this.storage.getTelemetryByExam(examId);
    const telemetryMap = new Map<string, QuestionTelemetry>();

    for (const t of telemetryList) {
      telemetryMap.set(`${t.examId}::${t.questionNumber}`, t);
    }

    return (eId: string, qNum: number) => telemetryMap.get(`${eId}::${qNum}`);
  }

  /**
   * Build AttemptRunnerConfig from mode and user config.
   */
  private buildRunnerConfig(
    mode: AttemptType,
    config: StartAttemptParams["config"],
    getTelemetry: (
      examId: string,
      questionNumber: number,
    ) => QuestionTelemetry | undefined,
  ) {
    return {
      timeLimitMs: mode === "simulacro" ? config?.timeLimitMs : undefined,
      questionCount: mode === "simulacro" ? config?.questionCount : undefined,
      getTelemetry,
    };
  }
}
