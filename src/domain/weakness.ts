/**
 * Weakness Calculation Module - Pure functions for determining question weakness
 *
 * This module calculates how "weak" a student is on a particular question,
 * which is used to prioritize questions for adaptive review mode.
 *
 * All functions are pure and testable without external dependencies.
 *
 * M4 Specification:
 * - Formula: (timesWrong * wrongWeight) + (timesBlank * blankWeight) + timePenalty - (consecutiveCorrect * recoveryWeight)
 * - Time Penalty: If avgResponseTimeMs > weakTimeThresholdMs → (avgResponseTimeMs - weakTimeThresholdMs) / weakTimeThresholdMs, else 0
 * - Result is clamped to >= 0
 *
 * CRITICAL ARCHITECTURAL RULE:
 * - NO imports from defaults.ts or any external configuration
 * - All configuration is INJECTED via function arguments
 * - Domain layer is pure and dependency-free
 */

import type { QuestionTelemetry } from "./types.js";

/**
 * Weights configuration for weakness calculation.
 * All fields are required for deterministic calculation.
 *
 * NOTE: Defaults must be applied OUTSIDE this module (application/service layer).
 * This interface is strictly for type checking injected configuration.
 */
export interface WeaknessWeights {
  wrongWeight: number;
  blankWeight: number;
  recoveryWeight: number;
  weakTimeThresholdMs: number;
}

/**
 * Re-export QuestionTelemetry for convenience
 */
export type { QuestionTelemetry };

/**
 * Calculate the time penalty for slow responses.
 *
 * M4 Formula:
 * If avgResponseTimeMs > weakTimeThresholdMs
 *   → (avgResponseTimeMs - weakTimeThresholdMs) / weakTimeThresholdMs
 * Otherwise → 0
 *
 * @param avgResponseTimeMs - Average response time in milliseconds
 * @param weakTimeThresholdMs - Threshold above which penalty applies
 * @returns Time penalty value (>= 0)
 */
export function calculateTimePenalty(
  avgResponseTimeMs: number,
  weakTimeThresholdMs: number
): number {
  if (avgResponseTimeMs <= weakTimeThresholdMs) {
    return 0;
  }
  return (avgResponseTimeMs - weakTimeThresholdMs) / weakTimeThresholdMs;
}

/**
 * Compute the weakness score for a question based on its telemetry.
 * Higher scores indicate weaker performance (needs more review).
 *
 * M4 Formula:
 *   weakScore = (timesWrong * wrongWeight)
 *             + (timesBlank * blankWeight)
 *             + timePenalty
 *             - (consecutiveCorrect * recoveryWeight)
 *
 *   where timePenalty = max(0, avgResponseTimeMs - weakTimeThresholdMs) / weakTimeThresholdMs
 *                     if avgResponseTimeMs > weakTimeThresholdMs, else 0
 *
 * CRITICAL RULES:
 * - Must be PURE (no side effects, no mutation of inputs)
 * - Must clamp result to >= 0
 * - No hidden global state
 * - No hardcoded numbers
 * - No external dependencies (all config injected)
 *
 * @param telemetry - The question's telemetry data
 * @param weights - Weights configuration (ALL fields required)
 * @returns Weakness score (clamped to >= 0)
 */
export function computeWeakScore(
  telemetry: QuestionTelemetry,
  weights: WeaknessWeights
): number {
  const {
    wrongWeight,
    blankWeight,
    recoveryWeight,
    weakTimeThresholdMs,
  } = weights;

  // Base weakness from wrong and blank answers
  const wrongContribution = telemetry.timesWrong * wrongWeight;
  const blankContribution = telemetry.timesBlank * blankWeight;

  // Time penalty for slow responses (indicates uncertainty)
  const timePenalty = calculateTimePenalty(
    telemetry.avgResponseTimeMs,
    weakTimeThresholdMs
  );

  // Recovery from consecutive correct answers
  const recovery = telemetry.consecutiveCorrect * recoveryWeight;

  // Calculate final weakness (clamped to >= 0)
  const weakness =
    wrongContribution + blankContribution + timePenalty - recovery;

  return Math.max(0, weakness);
}

/**
 * Sort questions by weakness score in descending order.
 * Questions with highest weakness (most needing review) come first.
 *
 * @param telemetryList - Array of question telemetry records
 * @param weights - Weights configuration for weakness calculation
 * @returns Sorted array of telemetry with their weakness scores
 */
export function sortByWeakness(
  telemetryList: QuestionTelemetry[],
  weights: WeaknessWeights
): Array<{ telemetry: QuestionTelemetry; weakness: number }> {
  const withScores = telemetryList.map((telemetry) => ({
    telemetry,
    weakness: computeWeakScore(telemetry, weights),
  }));

  return withScores.sort((a, b) => b.weakness - a.weakness);
}

/**
 * Select the top N weakest questions for review.
 * If there are not enough questions with telemetry, returns all available.
 *
 * @param telemetryList - Array of question telemetry records
 * @param count - Number of questions to select
 * @param weights - Weights configuration for weakness calculation
 * @returns Selected telemetry records with weakness scores
 */
export function selectWeakestQuestions(
  telemetryList: QuestionTelemetry[],
  count: number,
  weights: WeaknessWeights
): Array<{ telemetry: QuestionTelemetry; weakness: number }> {
  const sorted = sortByWeakness(telemetryList, weights);
  return sorted.slice(0, Math.max(0, count));
}

/**
 * Create empty telemetry for a question.
 * Used when a question has no prior telemetry data.
 *
 * @param examId - The exam ID
 * @param questionNumber - The question number
 * @returns Empty telemetry object
 */
export function createEmptyTelemetry(
  examId: string,
  questionNumber: number
): QuestionTelemetry {
  return {
    id: `${examId}::${questionNumber}`,
    examId,
    questionNumber,
    timesCorrect: 0,
    timesWrong: 0,
    timesBlank: 0,
    consecutiveCorrect: 0,
    avgResponseTimeMs: 0,
    totalSeen: 0,
    lastSeenAt: "",
  };
}

/**
 * Check if a question is considered "mastered" based on its telemetry.
 * A question is mastered if it has been seen multiple times and has
 * a streak of consecutive correct answers.
 *
 * @param telemetry - The question's telemetry
 * @param minConsecutive - Minimum consecutive correct answers (default: 3)
 * @param minAttempts - Minimum total attempts (default: 2)
 * @returns true if the question is mastered
 */
export function isQuestionMastered(
  telemetry: QuestionTelemetry,
  minConsecutive: number = 3,
  minAttempts: number = 2
): boolean {
  return (
    telemetry.totalSeen >= minAttempts &&
    telemetry.consecutiveCorrect >= minConsecutive
  );
}
