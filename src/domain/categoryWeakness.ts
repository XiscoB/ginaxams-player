/**
 * Category Weakness Aggregation — Pure Domain Logic (Phase 5)
 *
 * Computes weakness scores aggregated at the category level.
 * Each question's weakness is computed via the existing formula,
 * then averaged across all questions in each category.
 *
 * Rules:
 * - Pure function (no side effects, no mutation)
 * - Deterministic output (sorted by score DESC, then category ASC)
 * - Multi-category questions contribute to each category
 * - No modification to the existing weakness formula
 * - No imports from defaults or storage
 */

import type { Question, QuestionTelemetry, CategoryWeakness } from "./types.js";
import { computeWeakScore, type WeaknessWeights } from "./weakness.js";
import { createInitialTelemetry } from "./telemetry.js";

/**
 * Compute weakness scores aggregated by category.
 *
 * For each category, the score is the arithmetic mean of the weakness
 * scores of all questions that belong to that category.
 * A question belonging to multiple categories contributes to each.
 *
 * @param questions - All questions from the exam(s)
 * @param telemetry - Existing telemetry for some/all questions
 * @param weights - Weakness calculation weights (injected, not defaulted)
 * @returns Array of CategoryWeakness sorted by score DESC, then category ASC
 */
export function computeCategoryWeakness(
  questions: Question[],
  telemetry: QuestionTelemetry[],
  weights: WeaknessWeights,
): CategoryWeakness[] {
  // Build telemetry lookup by questionNumber
  const telemetryMap = new Map<number, QuestionTelemetry>();
  for (const t of telemetry) {
    telemetryMap.set(t.questionNumber, t);
  }

  // Accumulate per-category totals
  const categoryAccumulator = new Map<
    string,
    { totalWeakness: number; count: number }
  >();

  for (const question of questions) {
    const qt =
      telemetryMap.get(question.number) ??
      createInitialTelemetry("exam", question.number);

    const weakness = computeWeakScore(qt, weights);

    for (const category of question.categoria) {
      const existing = categoryAccumulator.get(category);
      if (existing) {
        existing.totalWeakness += weakness;
        existing.count += 1;
      } else {
        categoryAccumulator.set(category, {
          totalWeakness: weakness,
          count: 1,
        });
      }
    }
  }

  // Build result array
  const result: CategoryWeakness[] = [];
  for (const [category, { totalWeakness, count }] of categoryAccumulator) {
    result.push({
      category,
      score: totalWeakness / count,
    });
  }

  // Sort: score DESC, then category ASC for deterministic tie-breaking
  result.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.category.localeCompare(b.category);
  });

  return result;
}
