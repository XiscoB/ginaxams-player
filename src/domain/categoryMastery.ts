/**
 * Category Mastery Engine — Pure Domain Logic (Phase 6)
 *
 * Derives mastery classification per category by combining:
 *   - Category weakness scores (from categoryWeakness.ts)
 *   - Category accuracy stats (from categoryStats.ts)
 *
 * Mastery levels:
 *   - "weak":     weakness >= weakThreshold OR accuracy < accuracyLow
 *   - "mastered": weakness <= masteredThreshold AND accuracy >= accuracyHigh
 *   - "learning": everything else
 *
 * Rules:
 * - Pure function (no side effects, no mutation)
 * - Deterministic output (sorted by category ASC)
 * - Thresholds are injected, never imported from defaults
 * - No imports from defaults, storage, or application layers
 */

import type {
  Question,
  QuestionTelemetry,
  CategoryMastery,
  MasteryLevel,
} from "./types.js";
import type { WeaknessWeights } from "./weakness.js";
import { computeCategoryWeakness } from "./categoryWeakness.js";
import { computeCategoryStats } from "./categoryStats.js";

/**
 * Thresholds for mastery classification.
 * Injected to keep the function pure and configurable.
 */
export interface MasteryThresholds {
  /** Weakness score at or above which a category is classified as "weak" */
  weakThreshold: number;
  /** Weakness score at or below which a category can be "mastered" */
  masteredThreshold: number;
  /** Accuracy below this value forces "weak" classification */
  accuracyLow: number;
  /** Accuracy at or above this value is required for "mastered" */
  accuracyHigh: number;
}

/** Default thresholds (for reference; consumers should inject explicitly) */
export const DEFAULT_MASTERY_THRESHOLDS: MasteryThresholds = {
  weakThreshold: 2.0,
  masteredThreshold: 0.5,
  accuracyLow: 0.4,
  accuracyHigh: 0.8,
};

/**
 * Classify a single category's mastery level from its weakness score and accuracy.
 *
 * Decision order:
 * 1. If weakness >= weakThreshold OR accuracy < accuracyLow → "weak"
 * 2. If weakness <= masteredThreshold AND accuracy >= accuracyHigh → "mastered"
 * 3. Otherwise → "learning"
 *
 * @param weaknessScore - Average weakness for the category
 * @param accuracy - Accuracy ratio for the category (0–1)
 * @param thresholds - Classification thresholds
 * @returns The derived MasteryLevel
 */
export function classifyMastery(
  weaknessScore: number,
  accuracy: number,
  thresholds: MasteryThresholds,
): MasteryLevel {
  if (
    weaknessScore >= thresholds.weakThreshold ||
    accuracy < thresholds.accuracyLow
  ) {
    return "weak";
  }

  if (
    weaknessScore <= thresholds.masteredThreshold &&
    accuracy >= thresholds.accuracyHigh
  ) {
    return "mastered";
  }

  return "learning";
}

/**
 * Compute full category mastery model for all categories.
 *
 * Combines per-category weakness (from computeCategoryWeakness) and
 * per-category accuracy (from computeCategoryStats) into a unified
 * mastery classification per category.
 *
 * Categories that appear in weakness but not in stats (or vice versa)
 * are still included — missing weakness defaults to 0, missing accuracy
 * defaults to 0.
 *
 * @param questions - All questions from the exam(s)
 * @param telemetry - Existing telemetry for some/all questions
 * @param weights - Weakness calculation weights
 * @param thresholds - Mastery classification thresholds
 * @returns Array of CategoryMastery sorted by category ASC
 */
export function computeCategoryMastery(
  questions: Question[],
  telemetry: QuestionTelemetry[],
  weights: WeaknessWeights,
  thresholds: MasteryThresholds,
): CategoryMastery[] {
  const weaknessList = computeCategoryWeakness(questions, telemetry, weights);
  const statsList = computeCategoryStats(questions, telemetry);

  // Build lookup maps
  const weaknessMap = new Map<string, number>();
  for (const cw of weaknessList) {
    weaknessMap.set(cw.category, cw.score);
  }

  const accuracyMap = new Map<string, number>();
  for (const cs of statsList) {
    accuracyMap.set(cs.category, cs.accuracy);
  }

  // Collect all unique categories
  const allCategories = new Set<string>();
  for (const cw of weaknessList) allCategories.add(cw.category);
  for (const cs of statsList) allCategories.add(cs.category);

  // Build mastery array
  const result: CategoryMastery[] = [];
  for (const category of allCategories) {
    const weaknessScore = weaknessMap.get(category) ?? 0;
    const accuracy = accuracyMap.get(category) ?? 0;
    const level = classifyMastery(weaknessScore, accuracy, thresholds);

    result.push({
      category,
      weaknessScore,
      accuracy,
      level,
    });
  }

  // Sort by category ASC for deterministic output
  result.sort((a, b) => a.category.localeCompare(b.category));

  return result;
}
