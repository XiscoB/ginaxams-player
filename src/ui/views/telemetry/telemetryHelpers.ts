/**
 * Telemetry Helpers — Pure functions for Telemetry Dashboard analytics
 *
 * All functions are pure: no DOM, no side effects, no storage access.
 * Used by TelemetryView builders and tested independently.
 *
 * These helpers operate on TelemetryQuestionData which combines
 * question metadata with raw telemetry fields.
 */

import type { TelemetryQuestionData } from "../../../application/viewState.js";

// ============================================================================
// Sort Types
// ============================================================================

/**
 * Available sort criteria for the question performance table.
 */
export type TelemetrySortKey =
  | "mostWrong"
  | "mostSeen"
  | "leastSeen"
  | "slowestResponse"
  | "recentlySeen";

// ============================================================================
// Stability Indicator
// ============================================================================

/**
 * Stability classification for a question.
 *
 * - "stable": consistently answered correctly (high consecutive correct, low wrong)
 * - "unstable": has been answered correctly but also fails frequently
 * - "unlearned": mostly failed or never correctly answered
 * - "unseen": never attempted
 */
export type StabilityLevel = "stable" | "unstable" | "unlearned" | "unseen";

/**
 * Compute a stability indicator for a question.
 *
 * Uses consecutiveCorrect and timesWrong to classify learning stability:
 * - unseen: totalSeen === 0
 * - stable: consecutiveCorrect >= 3 AND timesWrong < consecutiveCorrect
 * - unstable: has correct answers but timesWrong >= timesCorrect
 * - unlearned: mostly wrong or blank, very few correct
 *
 * This metric is UI-only. It does NOT modify domain models.
 *
 * @param question - A single telemetry question data record
 * @returns The stability classification
 */
export function computeStability(
  question: TelemetryQuestionData,
): StabilityLevel {
  if (question.totalSeen === 0) {
    return "unseen";
  }

  if (
    question.consecutiveCorrect >= 3 &&
    question.timesWrong < question.consecutiveCorrect
  ) {
    return "stable";
  }

  if (question.timesCorrect > 0 && question.timesWrong >= question.timesCorrect) {
    return "unstable";
  }

  if (question.timesCorrect === 0) {
    return "unlearned";
  }

  // Has some correct, not enough consecutive, and wrong < correct
  // This is "learning" territory — treat as stable-ish
  return "stable";
}

// ============================================================================
// Sorting Functions
// ============================================================================

/**
 * Sort questions by timesWrong descending.
 * Ties broken by totalSeen descending.
 *
 * @param questions - Array of telemetry question data
 * @returns New sorted array (input is not mutated)
 */
export function sortByWrongCount(
  questions: readonly TelemetryQuestionData[],
): TelemetryQuestionData[] {
  return [...questions].sort((a, b) => {
    const diff = b.timesWrong - a.timesWrong;
    if (diff !== 0) return diff;
    return b.totalSeen - a.totalSeen;
  });
}

/**
 * Sort questions by avgResponseTimeMs descending (slowest first).
 * Only includes questions that have been seen (totalSeen > 0).
 * Ties broken by timesWrong descending.
 *
 * @param questions - Array of telemetry question data
 * @returns New sorted array (input is not mutated)
 */
export function sortByResponseTime(
  questions: readonly TelemetryQuestionData[],
): TelemetryQuestionData[] {
  return [...questions]
    .filter((q) => q.totalSeen > 0)
    .sort((a, b) => {
      const diff = b.avgResponseTimeMs - a.avgResponseTimeMs;
      if (diff !== 0) return diff;
      return b.timesWrong - a.timesWrong;
    });
}

/**
 * Sort questions by totalSeen descending (most seen first).
 *
 * @param questions - Array of telemetry question data
 * @returns New sorted array (input is not mutated)
 */
export function sortByMostSeen(
  questions: readonly TelemetryQuestionData[],
): TelemetryQuestionData[] {
  return [...questions].sort((a, b) => b.totalSeen - a.totalSeen);
}

/**
 * Sort questions by totalSeen ascending (least seen first).
 * Unseen questions appear first.
 *
 * @param questions - Array of telemetry question data
 * @returns New sorted array (input is not mutated)
 */
export function sortByLeastSeen(
  questions: readonly TelemetryQuestionData[],
): TelemetryQuestionData[] {
  return [...questions].sort((a, b) => a.totalSeen - b.totalSeen);
}

/**
 * Sort questions by lastSeenAt descending (most recently seen first).
 * Unseen questions (empty string) go to the end.
 *
 * @param questions - Array of telemetry question data
 * @returns New sorted array (input is not mutated)
 */
export function sortByRecentlySeen(
  questions: readonly TelemetryQuestionData[],
): TelemetryQuestionData[] {
  return [...questions].sort((a, b) => {
    // Unseen questions go to the end
    if (a.lastSeenAt === "" && b.lastSeenAt === "") return 0;
    if (a.lastSeenAt === "") return 1;
    if (b.lastSeenAt === "") return -1;
    return b.lastSeenAt.localeCompare(a.lastSeenAt);
  });
}

/**
 * Apply a named sort to a questions array.
 *
 * @param questions - Source array
 * @param sortKey - Sort criterion to apply
 * @returns Sorted copy
 */
export function sortQuestions(
  questions: readonly TelemetryQuestionData[],
  sortKey: TelemetrySortKey,
): TelemetryQuestionData[] {
  switch (sortKey) {
    case "mostWrong":
      return sortByWrongCount(questions);
    case "mostSeen":
      return sortByMostSeen(questions);
    case "leastSeen":
      return sortByLeastSeen(questions);
    case "slowestResponse":
      return sortByResponseTime(questions);
    case "recentlySeen":
      return sortByRecentlySeen(questions);
  }
}

// ============================================================================
// Filtering Functions
// ============================================================================

/**
 * Filter to only unseen questions (totalSeen === 0).
 *
 * @param questions - Array of telemetry question data
 * @returns Filtered array containing only unseen questions
 */
export function filterUnseenQuestions(
  questions: readonly TelemetryQuestionData[],
): TelemetryQuestionData[] {
  return questions.filter((q) => q.totalSeen === 0);
}

/**
 * Filter to only seen questions (totalSeen > 0).
 *
 * @param questions - Array of telemetry question data
 * @returns Filtered array containing only seen questions
 */
export function filterSeenQuestions(
  questions: readonly TelemetryQuestionData[],
): TelemetryQuestionData[] {
  return questions.filter((q) => q.totalSeen > 0);
}

/**
 * Filter questions by category name (exact match).
 *
 * @param questions - Array of telemetry question data
 * @param category - Category to match
 * @returns Filtered array
 */
export function filterByCategory(
  questions: readonly TelemetryQuestionData[],
  category: string,
): TelemetryQuestionData[] {
  return questions.filter((q) => q.categories.includes(category));
}

// ============================================================================
// Grouping Functions
// ============================================================================

/**
 * Group telemetry data by category.
 *
 * A question may belong to multiple categories, so it can appear
 * in multiple groups.
 *
 * @param questions - Array of telemetry question data
 * @returns Map of category name → questions in that category
 */
export function groupTelemetryByCategory(
  questions: readonly TelemetryQuestionData[],
): Map<string, TelemetryQuestionData[]> {
  const groups = new Map<string, TelemetryQuestionData[]>();
  for (const q of questions) {
    for (const cat of q.categories) {
      const list = groups.get(cat);
      if (list) {
        list.push(q);
      } else {
        groups.set(cat, [q]);
      }
    }
  }
  return groups;
}

/**
 * Compute unseen question counts per category.
 *
 * @param questions - Array of telemetry question data
 * @returns Map of category name → count of unseen questions
 */
export function computeUnseenByCategory(
  questions: readonly TelemetryQuestionData[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const q of questions) {
    if (q.totalSeen === 0) {
      for (const cat of q.categories) {
        counts.set(cat, (counts.get(cat) ?? 0) + 1);
      }
    }
  }
  return counts;
}

/**
 * Format milliseconds to a human-readable seconds string.
 *
 * @param ms - Milliseconds to format
 * @returns Formatted string like "12.3s"
 */
export function formatResponseTime(ms: number): string {
  if (ms === 0) return "—";
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Get the top N most failed questions (timesWrong > 0).
 *
 * @param questions - Array of telemetry question data
 * @param limit - Maximum results to return (default 10)
 * @returns Sorted and limited array
 */
export function getTopFailedQuestions(
  questions: readonly TelemetryQuestionData[],
  limit: number = 10,
): TelemetryQuestionData[] {
  return sortByWrongCount(questions)
    .filter((q) => q.timesWrong > 0)
    .slice(0, limit);
}

/**
 * Get the top N slowest questions (totalSeen > 0).
 *
 * @param questions - Array of telemetry question data
 * @param limit - Maximum results to return (default 10)
 * @returns Sorted and limited array
 */
export function getTopSlowestQuestions(
  questions: readonly TelemetryQuestionData[],
  limit: number = 10,
): TelemetryQuestionData[] {
  return sortByResponseTime(questions).slice(0, limit);
}
