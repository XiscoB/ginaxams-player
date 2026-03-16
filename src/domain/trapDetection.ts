/**
 * Trap Question Detection — Phase 9
 *
 * Derives a "trap" signal for each question by combining:
 *   - Question difficulty (from telemetry)
 *   - Category mastery (from category analytics)
 *
 * A trap question is one where the user's category mastery is high,
 * yet the user repeatedly fails the specific question. This typically
 * indicates misleading wording, double negatives, or trick answers.
 *
 * Formula:
 *   trapScore = difficultyScore × categoryMasteryScore
 *
 * Where categoryMasteryScore is derived from the question's category
 * mastery level: mastered → 1.0, learning → 0.5, weak → 0.0
 *
 * Classification:
 *   [0.0, possibleThreshold)   → "none"
 *   [possibleThreshold, confirmedThreshold) → "possible"
 *   [confirmedThreshold, 1.0]  → "confirmed"
 *
 * Rules:
 * - All functions are pure (no side effects, no mutation of inputs)
 * - Deterministic: same inputs → same outputs
 * - No imports from defaults.ts (config injected via arguments)
 * - No DOM, storage, or i18n dependencies
 */

import type { Question, QuestionTelemetry, CategoryMastery } from "./types.js";
import { computeDifficultyScore } from "./questionDifficulty.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Trap classification level.
 */
export type TrapLevel = "none" | "possible" | "confirmed";

/**
 * Computed trap signal for a single question.
 */
export interface TrapSignal {
  questionNumber: number;
  trapScore: number;
  trapLevel: TrapLevel;
}

/**
 * Thresholds for trap classification.
 * Injected to keep functions pure and configurable.
 */
export interface TrapThresholds {
  /** Score at or above which a question is classified as "possible" trap */
  possibleThreshold: number;
  /** Score at or above which a question is classified as "confirmed" trap */
  confirmedThreshold: number;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Convert a mastery level to a numeric score for trap calculation.
 *
 * mastered → 1.0 (high mastery means failure is surprising → trap signal)
 * learning → 0.5 (partial mastery gives moderate signal)
 * weak     → 0.0 (low mastery means failure is expected → no trap)
 *
 * @param level - The category mastery level
 * @returns Numeric mastery score in [0, 1]
 */
export function masteryLevelToScore(
  level: "weak" | "learning" | "mastered",
): number {
  switch (level) {
    case "mastered":
      return 1.0;
    case "learning":
      return 0.5;
    case "weak":
      return 0.0;
  }
}

/**
 * Compute the trap score for a single question.
 *
 * Formula: difficultyScore × categoryMasteryScore
 *
 * When a question belongs to multiple categories, the maximum mastery
 * score across those categories is used (worst-case trap signal).
 *
 * @param difficultyScore - The question's difficulty score in [0, 1]
 * @param masteryScore - The derived mastery score for the question's categories
 * @returns Trap score clamped to [0, 1]
 */
export function computeTrapScore(
  difficultyScore: number,
  masteryScore: number,
): number {
  const raw = difficultyScore * masteryScore;
  return Math.max(0, Math.min(1, raw));
}

/**
 * Classify a trap score into a discrete level.
 *
 * @param score - Trap score in [0, 1]
 * @param thresholds - Classification thresholds (injected, not imported)
 * @returns TrapLevel classification
 */
export function classifyTrap(
  score: number,
  thresholds: TrapThresholds,
): TrapLevel {
  if (score >= thresholds.confirmedThreshold) {
    return "confirmed";
  }
  if (score >= thresholds.possibleThreshold) {
    return "possible";
  }
  return "none";
}

/**
 * Resolve the mastery score for a question based on its categories.
 *
 * For multi-category questions, the maximum mastery score is used.
 * If no matching category mastery is found, defaults to 0 (no trap signal).
 *
 * @param questionCategories - The question's categories
 * @param masteryMap - Map of category → CategoryMastery
 * @returns Numeric mastery score in [0, 1]
 */
function resolveQuestionMasteryScore(
  questionCategories: ReadonlyArray<string>,
  masteryMap: ReadonlyMap<string, CategoryMastery>,
): number {
  let maxScore = 0;
  for (const cat of questionCategories) {
    const mastery = masteryMap.get(cat);
    if (mastery) {
      const score = masteryLevelToScore(mastery.level);
      if (score > maxScore) {
        maxScore = score;
      }
    }
  }
  return maxScore;
}

/**
 * Compute trap signals for all questions.
 *
 * Combines per-question difficulty (derived from telemetry) with
 * per-category mastery to produce a trap score and classification
 * for each question.
 *
 * Output is sorted by questionNumber ASC for deterministic ordering.
 *
 * @param questions - All questions from the exam(s)
 * @param telemetry - Existing telemetry for some/all questions
 * @param categoryMastery - Pre-computed category mastery data
 * @param thresholds - Trap classification thresholds (injected)
 * @returns Array of TrapSignal, sorted by questionNumber ASC
 */
export function computeTrapSignals(
  questions: ReadonlyArray<Question>,
  telemetry: ReadonlyArray<QuestionTelemetry>,
  categoryMastery: ReadonlyArray<CategoryMastery>,
  thresholds: TrapThresholds,
): TrapSignal[] {
  // Build telemetry lookup by questionNumber
  const telemetryMap = new Map<number, QuestionTelemetry>();
  for (const t of telemetry) {
    telemetryMap.set(t.questionNumber, t);
  }

  // Build mastery lookup by category
  const masteryMap = new Map<string, CategoryMastery>();
  for (const cm of categoryMastery) {
    masteryMap.set(cm.category, cm);
  }

  const results: TrapSignal[] = questions.map((question) => {
    const t = telemetryMap.get(question.number);
    const difficultyScore = t ? computeDifficultyScore(t) : 0;
    const masteryScore = resolveQuestionMasteryScore(
      question.categoria,
      masteryMap,
    );
    const trapScore = computeTrapScore(difficultyScore, masteryScore);
    const trapLevel = classifyTrap(trapScore, thresholds);

    return {
      questionNumber: question.number,
      trapScore,
      trapLevel,
    };
  });

  // Sort by questionNumber ASC for deterministic output
  results.sort((a, b) => a.questionNumber - b.questionNumber);

  return results;
}
