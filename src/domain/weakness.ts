/**
 * Weakness Calculation Module - Pure functions for determining question weakness
 * 
 * This module calculates how "weak" a student is on a particular question,
 * which is used to prioritize questions for adaptive review mode.
 * 
 * All functions are pure and testable without external dependencies.
 */

import type { QuestionTelemetry } from "./types.js";

/**
 * Default weights for weakness calculation.
 * These can be overridden by the caller.
 */
export interface WeaknessWeights {
  wrongWeight: number;
  blankWeight: number;
  recoveryWeight: number;
  timePenaltyFactor: number;
  weakTimeThresholdMs: number;
}

export const DEFAULT_WEAKNESS_WEIGHTS: WeaknessWeights = {
  wrongWeight: 2,
  blankWeight: 1.2,
  recoveryWeight: 1,
  timePenaltyFactor: 0.001,
  weakTimeThresholdMs: 15000, // 15 seconds
};

/**
 * Calculate the weakness score for a question based on its telemetry.
 * Higher scores indicate weaker performance (needs more review).
 * 
 * Formula:
 *   weakness = (timesWrong * wrongWeight)
 *            + (timesBlank * blankWeight)
 *            + timePenalty
 *            - (consecutiveCorrect * recoveryWeight)
 *   
 *   timePenalty = max(0, avgResponseTimeMs - weakTimeThresholdMs) * timePenaltyFactor
 * 
 * @param telemetry - The question's telemetry data
 * @param weights - Optional custom weights
 * @returns Weakness score (clamped to >= 0)
 */
export function calculateWeakness(
  telemetry: QuestionTelemetry,
  weights: Partial<WeaknessWeights> = {}
): number {
  const {
    wrongWeight = DEFAULT_WEAKNESS_WEIGHTS.wrongWeight,
    blankWeight = DEFAULT_WEAKNESS_WEIGHTS.blankWeight,
    recoveryWeight = DEFAULT_WEAKNESS_WEIGHTS.recoveryWeight,
    timePenaltyFactor = DEFAULT_WEAKNESS_WEIGHTS.timePenaltyFactor,
    weakTimeThresholdMs = DEFAULT_WEAKNESS_WEIGHTS.weakTimeThresholdMs,
  } = weights;

  // Base weakness from wrong and blank answers
  const wrongContribution = telemetry.timesWrong * wrongWeight;
  const blankContribution = telemetry.timesBlank * blankWeight;

  // Time penalty for slow responses (indicates uncertainty)
  const timePenalty = Math.max(
    0,
    (telemetry.avgResponseTimeMs - weakTimeThresholdMs) * timePenaltyFactor
  );

  // Recovery from consecutive correct answers
  const recovery = telemetry.consecutiveCorrect * recoveryWeight;

  // Calculate final weakness (clamped to >= 0)
  const weakness = wrongContribution + blankContribution + timePenalty - recovery;
  
  return Math.max(0, weakness);
}

/**
 * Sort questions by weakness score in descending order.
 * Questions with highest weakness (most needing review) come first.
 * 
 * @param telemetryList - Array of question telemetry records
 * @param weights - Optional custom weights for weakness calculation
 * @returns Sorted array of telemetry with their weakness scores
 */
export function sortByWeakness(
  telemetryList: QuestionTelemetry[],
  weights?: Partial<WeaknessWeights>
): Array<{ telemetry: QuestionTelemetry; weakness: number }> {
  const withScores = telemetryList.map((telemetry) => ({
    telemetry,
    weakness: calculateWeakness(telemetry, weights),
  }));

  return withScores.sort((a, b) => b.weakness - a.weakness);
}

/**
 * Select the top N weakest questions for review.
 * If there are not enough questions with telemetry, returns all available.
 * 
 * @param telemetryList - Array of question telemetry records
 * @param count - Number of questions to select
 * @param weights - Optional custom weights
 * @returns Selected telemetry records with weakness scores
 */
export function selectWeakestQuestions(
  telemetryList: QuestionTelemetry[],
  count: number,
  weights?: Partial<WeaknessWeights>
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
    examId,
    questionNumber,
    timesCorrect: 0,
    timesWrong: 0,
    timesBlank: 0,
    consecutiveCorrect: 0,
    avgResponseTimeMs: 0,
    totalSeen: 0,
    lastSeenAt: null,
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
