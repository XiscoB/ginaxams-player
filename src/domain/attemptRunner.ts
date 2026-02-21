/**
 * AttemptRunner - Pure domain engine for exam attempt execution
 *
 * This module provides a deterministic, side-effect-free runner for exam attempts.
 * It manages session state and returns immutable state snapshots.
 * Telemetry updates are computed and buffered but NOT persisted.
 *
 * Rules:
 * - No storage operations
 * - No direct telemetry persistence
 * - No UI dependencies
 * - No randomness (questions must be pre-shuffled)
 * - Deterministic: same inputs always produce same outputs
 * - Free mode does NOT generate telemetry updates
 * - Simulacro and Review DO generate telemetry updates
 */

import type {
  Attempt,
  Question,
  AttemptSessionState,
  SessionAnswerResult,
  AttemptResult,
  TelemetryUpdate,
  TelemetryLookup,
} from "./types.js";
import { calculatePercentage } from "./scoring.js";
import { createInitialTelemetry } from "./telemetry.js";

/**
 * Configuration for AttemptRunner
 */
export interface AttemptRunnerConfig {
  /** Time limit in milliseconds (optional) */
  timeLimitMs?: number;
  /** Question count limit for simulacro (optional) */
  questionCount?: number;
  /** Function to lookup existing telemetry (optional) */
  getTelemetry?: TelemetryLookup;
}

/**
 * AttemptRunner - Pure execution engine for exam attempts
 *
 * Manages the lifecycle of an attempt from start to finish.
 * All methods return new state snapshots without mutation.
 * Telemetry updates are buffered for external consumption.
 */
export class AttemptRunner {
  private attempt: Attempt;
  private questions: Question[];
  private config: AttemptRunnerConfig;
  private state: AttemptSessionState;
  private telemetryBuffer: TelemetryUpdate[] = [];
  private answerStartTime: number = 0;

  /**
   * Create a new AttemptRunner
   *
   * @param attempt - The persisted attempt record
   * @param questions - Pre-computed question set (already filtered/shuffled if needed)
   * @param config - Optional runtime configuration including telemetry lookup
   */
  constructor(
    attempt: Attempt,
    questions: Question[],
    config: AttemptRunnerConfig = {}
  ) {
    this.attempt = attempt;
    this.config = config;

    // Apply question count limit for simulacro if specified
    const limit = config.questionCount;
    if (limit !== undefined && limit > 0 && limit < questions.length) {
      this.questions = questions.slice(0, limit);
    } else {
      this.questions = questions;
    }

    // Initialize with placeholder state (must call start())
    this.state = {
      attemptId: attempt.id,
      attemptType: attempt.type,
      questions: this.questions,
      currentIndex: 0,
      answers: {},
      startedAt: 0,
      isFinished: false,
    };
  }

  /**
   * Start the attempt session
   *
   * Sets the start timestamp and returns initial state.
   * Must be called before submitAnswer.
   *
   * @returns Initial session state
   */
  start(): AttemptSessionState {
    this.state = {
      ...this.state,
      startedAt: Date.now(),
      remainingTimeMs: this.config.timeLimitMs,
    };
    this.answerStartTime = this.state.startedAt;
    return this.getState();
  }

  /**
   * Submit an answer for the current question
   *
   * Cannot be called after finish() or when isFinished is true.
   * For non-free attempts, computes and buffers telemetry updates.
   *
   * @param answerIndex - The selected answer index, or null for blank
   * @returns Updated session state
   * @throws Error if attempt is already finished or answer is invalid
   */
  submitAnswer(answerIndex: number | null): AttemptSessionState {
    if (this.state.isFinished) {
      throw new Error("Cannot submit answer: attempt is already finished");
    }

    if (this.state.startedAt === 0) {
      throw new Error("Cannot submit answer: attempt not started");
    }

    const currentQuestion = this.state.questions[this.state.currentIndex];
    if (!currentQuestion) {
      throw new Error("No question available at current index");
    }

    // Determine correctness
    let isCorrect = false;
    if (answerIndex !== null) {
      const selectedAnswer = currentQuestion.answers[answerIndex];
      if (!selectedAnswer) {
        throw new Error(`Invalid answer index: ${answerIndex}`);
      }
      isCorrect = selectedAnswer.isCorrect;
    }

    // Store answer (immutable update)
    const answerResult: SessionAnswerResult = {
      selectedIndex: answerIndex,
      isCorrect,
    };

    this.state = {
      ...this.state,
      answers: {
        ...this.state.answers,
        [currentQuestion.number]: answerResult,
      },
    };

    // Compute telemetry update for non-free attempts
    if (this.attempt.type !== "free") {
      this.computeTelemetryUpdate(
        currentQuestion,
        answerIndex,
        isCorrect
      );
    }

    return this.getState();
  }

  /**
   * Move to the next question
   *
   * Will not overflow past the last question.
   * Resets answer start time for response time tracking.
   *
   * @returns Updated session state
   */
  next(): AttemptSessionState {
    if (this.state.isFinished) {
      return this.getState();
    }

    const nextIndex = this.state.currentIndex + 1;
    if (nextIndex < this.state.questions.length) {
      this.state = {
        ...this.state,
        currentIndex: nextIndex,
      };
      this.answerStartTime = Date.now();
    }

    return this.getState();
  }

  /**
   * Finish the attempt and compute final results
   *
   * After finish(), no further state changes are allowed.
   *
   * @returns Final session state with result
   */
  finish(): AttemptSessionState {
    if (this.state.isFinished) {
      return this.getState();
    }

    const result = this.computeResult();

    this.state = {
      ...this.state,
      isFinished: true,
      result,
    };

    return this.getState();
  }

  /**
   * Get current state snapshot
   *
   * @returns Current session state (immutable copy)
   */
  getState(): AttemptSessionState {
    // Return deep copy to prevent external mutation
    return {
      ...this.state,
      questions: [...this.state.questions],
      answers: { ...this.state.answers },
      result: this.state.result ? { ...this.state.result } : undefined,
    };
  }

  /**
   * Get pending telemetry updates without clearing buffer
   *
   * @returns Array of pending telemetry updates
   */
  getPendingTelemetryUpdates(): TelemetryUpdate[] {
    return [...this.telemetryBuffer];
  }

  /**
   * Consume all pending telemetry updates and clear buffer
   *
   * This is the single-write path for telemetry persistence.
   * Callers should persist these updates to storage.
   *
   * @returns Array of telemetry updates to persist
   */
  consumeTelemetryUpdates(): TelemetryUpdate[] {
    const updates = [...this.telemetryBuffer];
    this.telemetryBuffer = [];
    return updates;
  }

  /**
   * Compute telemetry update for a question answer
   *
   * Pure computation - only buffers the update, does NOT persist.
   *
   * @private
   */
  private computeTelemetryUpdate(
    question: Question,
    answerIndex: number | null,
    isCorrect: boolean
  ): void {
    const examId = this.attempt.sourceExamIds[0]; // Primary exam ID
    const questionNumber = question.number;

    // Lookup existing telemetry or initialize
    const existing = this.config.getTelemetry
      ? this.config.getTelemetry(examId, questionNumber)
      : undefined;

    const previous = existing ?? createInitialTelemetry(examId, questionNumber);

    // Compute response time
    const now = Date.now();
    const responseTimeMs = now - this.answerStartTime;

    // Determine result type
    const isBlank = answerIndex === null;

    // Compute new telemetry (immutable)
    const next: typeof previous = {
      ...previous,
      totalSeen: previous.totalSeen + 1,
      lastSeenAt: new Date().toISOString(),
    };

    // Update counters based on result
    if (isBlank) {
      next.timesBlank = previous.timesBlank + 1;
      next.consecutiveCorrect = 0;
    } else if (isCorrect) {
      next.timesCorrect = previous.timesCorrect + 1;
      next.consecutiveCorrect = previous.consecutiveCorrect + 1;
    } else {
      next.timesWrong = previous.timesWrong + 1;
      next.consecutiveCorrect = 0;
    }

    // Update rolling average for response time
    if (next.totalSeen === 1) {
      next.avgResponseTimeMs = responseTimeMs;
    } else {
      next.avgResponseTimeMs =
        (previous.avgResponseTimeMs * (previous.totalSeen) + responseTimeMs) /
        next.totalSeen;
    }

    // Buffer the update
    this.telemetryBuffer.push({
      examId,
      questionNumber,
      previous: existing, // undefined if new
      next,
    });
  }

  /**
   * Compute final attempt result
   *
   * Pure calculation based on current answers.
   *
   * @private
   */
  private computeResult(): AttemptResult {
    let correct = 0;
    let wrong = 0;
    let blank = 0;

    for (const question of this.questions) {
      const answer = this.state.answers[question.number];

      if (!answer || answer.selectedIndex === null) {
        blank++;
      } else if (answer.isCorrect) {
        correct++;
      } else {
        wrong++;
      }
    }

    const total = this.questions.length;
    const percentage = calculatePercentage(correct, total);

    // Simple score: percentage (can be enhanced with penalties later)
    const score = percentage;

    return {
      correct,
      wrong,
      blank,
      score,
      percentage,
    };
  }
}
