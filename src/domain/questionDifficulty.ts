/**
 * Question Difficulty Module — Phase 8
 *
 * Derives a difficulty estimation for each question from telemetry data.
 * Difficulty represents how often users fail the question, distinguishing
 * inherently hard questions from user-specific weakness.
 *
 * Formula:
 *   difficulty = (timesWrong + timesBlank) / totalSeen
 *
 * Classification thresholds:
 *   0.0 – 0.3 → easy
 *   0.3 – 0.6 → medium
 *   0.6 – 1.0 → hard
 *
 * Rules:
 * - All functions are pure (no side effects, no mutation of inputs)
 * - Deterministic: same inputs → same outputs
 * - No imports from defaults.ts (config injected via arguments)
 * - No DOM, storage, or i18n dependencies
 */

import type { Question, QuestionTelemetry } from "./types.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Difficulty classification level.
 */
export type DifficultyLevel = "easy" | "medium" | "hard";

/**
 * Computed difficulty for a single question.
 */
export interface QuestionDifficulty {
  questionNumber: number;
  difficultyScore: number;
  difficultyLevel: DifficultyLevel;
}

/**
 * Configuration for difficulty-based review adjustment multipliers.
 * Applied to weakness scores during review selection.
 */
export interface DifficultyAdjustmentConfig {
  /** Multiplier for easy questions (> 1.0 = boost, failing easy questions is a stronger signal) */
  easyBoost: number;
  /** Multiplier for medium questions (typically 1.0 = neutral) */
  mediumBoost: number;
  /** Multiplier for hard questions (< 1.0 = penalty, hard questions don't dominate review) */
  hardPenalty: number;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Compute the difficulty score for a single question's telemetry.
 *
 * Formula: (timesWrong + timesBlank) / totalSeen
 *
 * @param telemetry - The question's telemetry data
 * @returns Difficulty score clamped to [0, 1]
 */
export function computeDifficultyScore(telemetry: QuestionTelemetry): number {
  if (telemetry.totalSeen === 0) {
    return 0;
  }

  const raw =
    (telemetry.timesWrong + telemetry.timesBlank) / telemetry.totalSeen;
  return Math.max(0, Math.min(1, raw));
}

/**
 * Classify a difficulty score into a discrete level.
 *
 * Thresholds:
 *   [0.0, 0.3) → easy
 *   [0.3, 0.6) → medium
 *   [0.6, 1.0] → hard
 *
 * @param score - Difficulty score in [0, 1]
 * @returns DifficultyLevel classification
 */
export function classifyDifficulty(score: number): DifficultyLevel {
  if (score < 0.3) {
    return "easy";
  }
  if (score < 0.6) {
    return "medium";
  }
  return "hard";
}

/**
 * Compute difficulty for all questions given their telemetry.
 *
 * For questions without telemetry, difficulty defaults to 0 (easy).
 * Output is sorted by questionNumber ASC for deterministic ordering.
 *
 * @param questions - All questions from the exam(s)
 * @param telemetry - Existing telemetry for some/all questions
 * @returns Array of QuestionDifficulty, sorted by questionNumber ASC
 */
export function computeQuestionDifficulty(
  questions: ReadonlyArray<Question>,
  telemetry: ReadonlyArray<QuestionTelemetry>,
): QuestionDifficulty[] {
  // Build telemetry lookup by questionNumber
  const telemetryMap = new Map<number, QuestionTelemetry>();
  for (const t of telemetry) {
    telemetryMap.set(t.questionNumber, t);
  }

  const results: QuestionDifficulty[] = questions.map((question) => {
    const t = telemetryMap.get(question.number);
    const difficultyScore = t ? computeDifficultyScore(t) : 0;
    const difficultyLevel = classifyDifficulty(difficultyScore);

    return {
      questionNumber: question.number,
      difficultyScore,
      difficultyLevel,
    };
  });

  // Sort by questionNumber ASC for deterministic output
  results.sort((a, b) => a.questionNumber - b.questionNumber);

  return results;
}

/**
 * Get the difficulty adjustment multiplier for a given difficulty level.
 *
 * @param level - The difficulty classification
 * @param config - Difficulty adjustment configuration (injected, not imported)
 * @returns The multiplier to apply to the weakness score
 */
export function getDifficultyMultiplier(
  level: DifficultyLevel,
  config: DifficultyAdjustmentConfig,
): number {
  switch (level) {
    case "easy":
      return config.easyBoost;
    case "medium":
      return config.mediumBoost;
    case "hard":
      return config.hardPenalty;
  }
}
