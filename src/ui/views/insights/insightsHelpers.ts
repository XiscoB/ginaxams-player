/**
 * Insights Helpers — Pure functions for Insights data transformations
 *
 * All functions are pure: no DOM, no side effects, no storage access.
 * Used by Insights view builders and tested independently.
 */

import type {
  InsightsQuestionData,
  InsightsDifficultyDistribution,
} from "../../../application/viewState.js";
import type { CategoryMastery } from "../../../domain/types.js";

// ============================================================================
// Category Mastery Sorting
// ============================================================================

/**
 * Sort category mastery entries by weakness (weakest first).
 * Categories with higher weakness scores appear first.
 * Ties are broken by accuracy ascending.
 *
 * @param mastery - Array of category mastery entries
 * @returns New sorted array (input is not mutated)
 */
export function sortCategoryMasteryByWeakness(
  mastery: readonly CategoryMastery[],
): CategoryMastery[] {
  return [...mastery].sort((a, b) => {
    const diff = b.weaknessScore - a.weaknessScore;
    if (diff !== 0) return diff;
    return a.accuracy - b.accuracy;
  });
}

/**
 * Count questions per category from enriched question data.
 *
 * @param questions - All enriched questions
 * @returns Map of category name → question count
 */
export function countQuestionsPerCategory(
  questions: readonly InsightsQuestionData[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const q of questions) {
    for (const cat of q.categories) {
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
  }
  return counts;
}

// ============================================================================
// Weak Questions
// ============================================================================

/**
 * Get questions sorted by weakness score descending.
 * Only includes questions with weakness > 0.
 *
 * @param questions - All enriched questions
 * @returns Filtered and sorted array
 */
export function getWeakQuestionsSorted(
  questions: readonly InsightsQuestionData[],
): InsightsQuestionData[] {
  return [...questions]
    .filter((q) => q.weaknessScore > 0)
    .sort((a, b) => b.weaknessScore - a.weaknessScore);
}

/**
 * Filter questions by category name.
 *
 * @param questions - Questions to filter
 * @param category - Category to match (exact match)
 * @returns Filtered array
 */
export function filterByCategory(
  questions: readonly InsightsQuestionData[],
  category: string,
): InsightsQuestionData[] {
  return questions.filter((q) => q.categories.includes(category));
}

// ============================================================================
// Trap Questions
// ============================================================================

/**
 * Get only trap questions (possible or confirmed).
 * Sorted by trap score descending.
 *
 * @param questions - All enriched questions
 * @returns Filtered and sorted array
 */
export function getTrapQuestions(
  questions: readonly InsightsQuestionData[],
): InsightsQuestionData[] {
  return [...questions]
    .filter((q) => q.trapLevel !== "none")
    .sort((a, b) => b.trapScore - a.trapScore);
}

// ============================================================================
// Difficulty Distribution
// ============================================================================

/**
 * Compute percentage breakdown for difficulty distribution.
 *
 * @param dist - Raw difficulty counts
 * @returns Object with percentage values (0–100), or all zeros if total is 0
 */
export function computeDifficultyPercentages(
  dist: InsightsDifficultyDistribution,
): { easy: number; medium: number; hard: number } {
  if (dist.total === 0) {
    return { easy: 0, medium: 0, hard: 0 };
  }
  return {
    easy: Math.round((dist.easy / dist.total) * 100),
    medium: Math.round((dist.medium / dist.total) * 100),
    hard: Math.round((dist.hard / dist.total) * 100),
  };
}

// ============================================================================
// Question Text Helpers
// ============================================================================

/**
 * Truncate question text for preview display.
 *
 * @param text - Full question text
 * @param maxLength - Maximum length before truncation (default 80)
 * @returns Truncated text with ellipsis if needed
 */
export function truncateText(text: string, maxLength: number = 80): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + "…";
}
