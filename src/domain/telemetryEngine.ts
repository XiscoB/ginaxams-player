/**
 * Telemetry Engine - Pure domain logic for telemetry updates
 *
 * This module contains pure functions for updating and manipulating
 * question telemetry. No DOM, no IndexedDB calls, no side effects.
 *
 * Rules:
 * - Free mode does NOT update telemetry (returns existing unchanged)
 * - Simulacro and Review DO update telemetry
 * - Blank answers increase weakness (lower weight than wrong)
 * - Wrong answers increase weakness more strongly
 * - Consecutive correct answers reduce weakness
 * - Historical mistake counts are never deleted
 * - Weakness score is derived at runtime (not stored)
 */

import type { AttemptType, QuestionTelemetry } from "./types.js";
import { createInitialTelemetry, calculateRollingAverage } from "./telemetry.js";

/**
 * Input for telemetry update operation
 */
export interface TelemetryUpdateInput {
  attemptType: AttemptType;
  examId: string;
  questionNumber: number;
  isCorrect: boolean;
  isBlank: boolean;
  responseTimeMs: number;
  now: string;
}

/**
 * Default weights for weakness calculation
 * These are centralized and user-configurable
 */
export const DEFAULT_WEIGHTS: {
  wrongWeight: number;
  blankWeight: number;
  recoveryWeight: number;
  weakTimeThresholdMs: number;
} = {
  wrongWeight: 2,
  blankWeight: 1.2,
  recoveryWeight: 1,
  weakTimeThresholdMs: 15000,
};

/**
 * Update telemetry based on an answer result
 *
 * Rules:
 * - If attemptType === "free" → return existing unchanged
 * - If existing === null → initialize fresh telemetry object
 * - totalSeen increments on simulacro/review
 * - If isBlank: timesBlank++, consecutiveCorrect = 0
 * - Else if isCorrect: timesCorrect++, consecutiveCorrect++
 * - Else: timesWrong++, consecutiveCorrect = 0
 * - avgResponseTimeMs uses rolling average
 *
 * @param existing - Current telemetry or null if first time
 * @param input - Update input parameters
 * @returns New telemetry object or null if free mode
 */
export function updateTelemetry(
  existing: QuestionTelemetry | null,
  input: TelemetryUpdateInput
): QuestionTelemetry | null {
  // Rule: Free mode does NOT update telemetry
  if (input.attemptType === "free") {
    return existing;
  }

  // Validate input
  validateUpdateInput(input);

  // Initialize if no existing telemetry
  const telemetry: QuestionTelemetry =
    existing ?? createInitialTelemetry(input.examId, input.questionNumber);

  // Create new object (immutable update)
  const updated: QuestionTelemetry = { ...telemetry };

  // Increment total seen
  updated.totalSeen = telemetry.totalSeen + 1;

  // Update counters based on result
  if (input.isBlank) {
    updated.timesBlank = telemetry.timesBlank + 1;
    updated.consecutiveCorrect = 0;
  } else if (input.isCorrect) {
    updated.timesCorrect = telemetry.timesCorrect + 1;
    updated.consecutiveCorrect = telemetry.consecutiveCorrect + 1;
  } else {
    updated.timesWrong = telemetry.timesWrong + 1;
    updated.consecutiveCorrect = 0;
  }

  // Update rolling average for response time
  updated.avgResponseTimeMs = calculateRollingAverage(
    telemetry.avgResponseTimeMs,
    updated.totalSeen,
    input.responseTimeMs
  );

  // Update last seen timestamp
  updated.lastSeenAt = input.now;

  return updated;
}

/**
 * Validate telemetry update input
 */
function validateUpdateInput(input: TelemetryUpdateInput): void {
  if (typeof input.examId !== "string" || input.examId.length === 0) {
    throw new Error("examId must be a non-empty string");
  }

  if (
    typeof input.questionNumber !== "number" ||
    !Number.isInteger(input.questionNumber) ||
    input.questionNumber < 1
  ) {
    throw new Error("questionNumber must be a positive integer");
  }

  if (typeof input.isCorrect !== "boolean") {
    throw new Error("isCorrect must be a boolean");
  }

  if (typeof input.isBlank !== "boolean") {
    throw new Error("isBlank must be a boolean");
  }

  // Cannot be both correct and blank
  if (input.isCorrect && input.isBlank) {
    throw new Error("isCorrect and isBlank cannot both be true");
  }

  if (typeof input.responseTimeMs !== "number" || input.responseTimeMs < 0) {
    throw new Error("responseTimeMs must be a non-negative number");
  }

  if (typeof input.now !== "string" || input.now.length === 0) {
    throw new Error("now must be a non-empty ISO date string");
  }

  const date = new Date(input.now);
  if (isNaN(date.getTime())) {
    throw new Error("now must be a valid ISO date string");
  }
}

/**
 * Reset telemetry for a specific exam
 * Removes only telemetry entries for that exam
 *
 * @param telemetry - Array of all telemetry entries
 * @param examId - Exam ID to reset
 * @returns New array without telemetry for the specified exam
 */
export function resetTelemetryForExam(
  telemetry: QuestionTelemetry[],
  examId: string
): QuestionTelemetry[] {
  if (typeof examId !== "string" || examId.length === 0) {
    throw new Error("examId must be a non-empty string");
  }

  return telemetry.filter((t) => t.examId !== examId);
}

/**
 * Get telemetry entries for a specific exam
 * Pure filter helper
 *
 * @param telemetry - Array of all telemetry entries
 * @param examId - Exam ID to filter by
 * @returns Array of telemetry entries for the specified exam
 */
export function getTelemetryByExam(
  telemetry: QuestionTelemetry[],
  examId: string
): QuestionTelemetry[] {
  if (typeof examId !== "string" || examId.length === 0) {
    throw new Error("examId must be a non-empty string");
  }

  return telemetry.filter((t) => t.examId === examId);
}

/**
 * Calculate weakness score for a question
 * This is a DERIVED value - never stored, computed at runtime
 *
 * Formula:
 *   weakness = (timesWrong * wrongWeight)
 *            + (timesBlank * blankWeight)
 *            + timePenalty
 *            - (consecutiveCorrect * recoveryWeight)
 *   Clamp to >= 0
 *
 * @param telemetry - Question telemetry
 * @param weights - Optional custom weights
 * @returns Weakness score (higher = more weak)
 */
export function calculateWeakness(
  telemetry: QuestionTelemetry,
  weights: Partial<typeof DEFAULT_WEIGHTS> = {}
): number {
  const {
    wrongWeight = DEFAULT_WEIGHTS.wrongWeight,
    blankWeight = DEFAULT_WEIGHTS.blankWeight,
    recoveryWeight = DEFAULT_WEIGHTS.recoveryWeight,
    weakTimeThresholdMs = DEFAULT_WEIGHTS.weakTimeThresholdMs,
  } = weights;

  // Base weakness from mistakes
  const wrongContribution = telemetry.timesWrong * wrongWeight;
  const blankContribution = telemetry.timesBlank * blankWeight;

  // Time penalty: slower responses indicate uncertainty
  // If avgResponseTimeMs > threshold, add penalty proportional to excess
  let timePenalty = 0;
  if (telemetry.avgResponseTimeMs > weakTimeThresholdMs) {
    // Normalize: excess time as a fraction of threshold
    const excessRatio =
      (telemetry.avgResponseTimeMs - weakTimeThresholdMs) / weakTimeThresholdMs;
    // Cap at 1.0 (100% excess), scale to be comparable to mistake weights
    timePenalty = Math.min(excessRatio, 1.0) * 0.5;
  }

  // Recovery from consecutive correct answers
  const recovery = telemetry.consecutiveCorrect * recoveryWeight;

  // Calculate final weakness
  let weakness = wrongContribution + blankContribution + timePenalty - recovery;

  // Clamp to non-negative
  return Math.max(0, weakness);
}

/**
 * Compare two telemetry entries by weakness (descending)
 * Used for sorting questions by weakness
 */
export function compareByWeakness(
  a: QuestionTelemetry,
  b: QuestionTelemetry,
  weights?: Partial<typeof DEFAULT_WEIGHTS>
): number {
  const weaknessA = calculateWeakness(a, weights);
  const weaknessB = calculateWeakness(b, weights);
  return weaknessB - weaknessA; // Descending order (higher weakness first)
}

/**
 * Compare two telemetry entries by lastSeenAt (ascending)
 * Used for finding least recently seen questions
 */
export function compareByLastSeen(
  a: QuestionTelemetry,
  b: QuestionTelemetry
): number {
  // Handle empty lastSeenAt (never seen = should be prioritized)
  if (a.lastSeenAt.length === 0 && b.lastSeenAt.length === 0) {
    return 0;
  }
  if (a.lastSeenAt.length === 0) {
    return -1; // a comes first
  }
  if (b.lastSeenAt.length === 0) {
    return 1; // b comes first
  }

  const dateA = new Date(a.lastSeenAt).getTime();
  const dateB = new Date(b.lastSeenAt).getTime();
  return dateA - dateB; // Ascending order (oldest first)
}

/**
 * Sort telemetry by weakness (descending) for review mode
 */
export function sortByWeakness(
  telemetry: QuestionTelemetry[],
  weights?: Partial<typeof DEFAULT_WEIGHTS>
): QuestionTelemetry[] {
  return [...telemetry].sort((a, b) => compareByWeakness(a, b, weights));
}

/**
 * Sort telemetry by lastSeenAt (ascending) for finding stale questions
 */
export function sortByLastSeen(telemetry: QuestionTelemetry[]): QuestionTelemetry[] {
  return [...telemetry].sort(compareByLastSeen);
}

/**
 * Select top N questions by weakness for review mode
 * If insufficient weak questions, fills with least recently seen
 *
 * @param telemetry - All available telemetry
 * @param count - Number of questions to select (default: 60)
 * @param weights - Optional custom weights
 * @returns Selected telemetry entries
 */
export function selectQuestionsForReview(
  telemetry: QuestionTelemetry[],
  count: number = 60,
  weights?: Partial<typeof DEFAULT_WEIGHTS>
): QuestionTelemetry[] {
  if (count < 1) {
    throw new Error("count must be a positive integer");
  }

  if (telemetry.length === 0) {
    return [];
  }

  // First, sort by weakness descending
  const byWeakness = sortByWeakness(telemetry, weights);

  // Take top N by weakness
  const selected = byWeakness.slice(0, count);

  // If we have enough, return them
  if (selected.length >= count) {
    return selected;
  }

  // Otherwise, fill with least recently seen from remaining
  const remaining = byWeakness.slice(count);
  const byLastSeen = sortByLastSeen(remaining);
  const needed = count - selected.length;

  return [...selected, ...byLastSeen.slice(0, needed)];
}

/**
 * Merge telemetry updates into an array
 * Replaces existing entries or adds new ones
 *
 * @param existing - Current telemetry array
 * @param updates - New or updated telemetry entries
 * @returns New array with updates applied
 */
export function mergeTelemetryUpdates(
  existing: QuestionTelemetry[],
  updates: QuestionTelemetry[]
): QuestionTelemetry[] {
  const result = [...existing];

  for (const update of updates) {
    const index = result.findIndex((t) => t.id === update.id);
    if (index >= 0) {
      result[index] = update;
    } else {
      result.push(update);
    }
  }

  return result;
}
