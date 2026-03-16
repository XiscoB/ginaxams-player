/**
 * Category Performance Tracking — Pure Domain Logic (Phase 5)
 *
 * Computes per-category performance statistics from question telemetry.
 * All calculations are derived at runtime from existing telemetry — no
 * telemetry mutation, no stored aggregates.
 *
 * Rules:
 * - Pure function (no side effects, no mutation)
 * - Deterministic output (sorted by category ASC)
 * - Multi-category questions contribute to each category
 * - Divide-by-zero handled safely (accuracy = 0)
 * - No imports from defaults or storage
 */

import type { Question, QuestionTelemetry, CategoryStats } from "./types.js";
import { createInitialTelemetry } from "./telemetry.js";

/**
 * Compute per-category performance statistics from telemetry.
 *
 * For each category:
 * - questionsAttempted = sum of (timesCorrect + timesWrong + timesBlank) for all questions in that category
 * - questionsCorrect  = sum of timesCorrect for all questions in that category
 * - accuracy           = questionsCorrect / questionsAttempted (0 when questionsAttempted === 0)
 *
 * A question belonging to multiple categories contributes to each.
 *
 * @param questions - All questions from the exam(s)
 * @param telemetry - Existing telemetry for some/all questions
 * @returns Array of CategoryStats sorted by category ASC
 */
export function computeCategoryStats(
  questions: Question[],
  telemetry: QuestionTelemetry[],
): CategoryStats[] {
  // Build telemetry lookup by questionNumber
  const telemetryMap = new Map<number, QuestionTelemetry>();
  for (const t of telemetry) {
    telemetryMap.set(t.questionNumber, t);
  }

  // Accumulate per-category totals
  const categoryAccumulator = new Map<
    string,
    { attempted: number; correct: number }
  >();

  for (const question of questions) {
    const qt =
      telemetryMap.get(question.number) ??
      createInitialTelemetry("exam", question.number);

    const attempted = qt.timesCorrect + qt.timesWrong + qt.timesBlank;
    const correct = qt.timesCorrect;

    for (const category of question.categoria) {
      const existing = categoryAccumulator.get(category);
      if (existing) {
        existing.attempted += attempted;
        existing.correct += correct;
      } else {
        categoryAccumulator.set(category, {
          attempted,
          correct,
        });
      }
    }
  }

  // Build result array
  const result: CategoryStats[] = [];
  for (const [category, { attempted, correct }] of categoryAccumulator) {
    result.push({
      category,
      questionsAttempted: attempted,
      questionsCorrect: correct,
      accuracy: attempted === 0 ? 0 : correct / attempted,
    });
  }

  // Sort by category ASC for deterministic output
  result.sort((a, b) => a.category.localeCompare(b.category));

  return result;
}
