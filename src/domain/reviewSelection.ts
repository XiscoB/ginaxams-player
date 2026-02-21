/**
 * Review Selection Module - Deterministic adaptive question selection
 *
 * This module provides pure functions for selecting questions for review mode
 * based on weakness scores and telemetry data.
 *
 * Rules:
 * - All functions are pure (no side effects, no mutation)
 * - Deterministic sorting with explicit tie-breaking
 * - No randomness
 * - No telemetry mutation
 * - No UI dependencies
 */

import type { Question, QuestionTelemetry } from "./types.js";
import { computeWeakScore, type WeaknessWeights } from "./weakness.js";
import { createInitialTelemetry } from "./telemetry.js";

// Alias for clarity in review context
const createEmptyTelemetry = createInitialTelemetry;

/**
 * Question with its computed weakness and selection metadata
 */
export interface ReviewQuestion {
  question: Question;
  telemetry: QuestionTelemetry;
  weakness: number;
  isWeaknessBased: boolean; // true if selected by weakness, false if fallback
}

/**
 * Generate the review question set deterministically.
 *
 * Selection process:
 * 1. Compute weakness for all questions with telemetry
 * 2. Create empty telemetry for questions without data
 * 3. Sort by: weakness DESC → lastSeenAt ASC (older first) → question.number ASC
 * 4. Take top N by weakness
 * 5. If fewer than N, fill remainder with least recently seen questions
 * 6. Return deterministic ordered list
 *
 * @param questions - All questions from the exam(s)
 * @param telemetryList - Existing telemetry for some questions
 * @param count - Number of questions to select (default 60)
 * @param weights - Weakness calculation weights
 * @returns Deterministically sorted review questions
 */
export function generateReviewQuestions(
  questions: Question[],
  telemetryList: QuestionTelemetry[],
  count: number,
  weights: WeaknessWeights
): ReviewQuestion[] {
  // Create lookup map for existing telemetry (keyed by questionNumber)
  const telemetryMap = new Map<number, QuestionTelemetry>();
  for (const t of telemetryList) {
    telemetryMap.set(t.questionNumber, t);
  }

  // Build review items for all questions
  const items: ReviewQuestion[] = questions.map((question) => {
    // Use existing telemetry or create empty
    const existing = telemetryMap.get(question.number);
    const telemetry = existing ?? createEmptyTelemetry("exam", question.number);

    // Compute weakness (0 for empty telemetry)
    const weakness = computeWeakScore(telemetry, weights);

    return {
      question,
      telemetry,
      weakness,
      isWeaknessBased: false, // Will be set after sorting
    };
  });

  // Sort deterministically:
  // 1. Weakness DESC (highest first)
  // 2. lastSeenAt ASC (older first, empty string = never seen = first)
  // 3. question.number ASC (lower first)
  items.sort((a, b) => {
    // Primary: weakness DESC
    if (b.weakness !== a.weakness) {
      return b.weakness - a.weakness;
    }

    // Secondary: lastSeenAt ASC (empty = never seen = comes first)
    const aSeen = a.telemetry.lastSeenAt;
    const bSeen = b.telemetry.lastSeenAt;
    if (aSeen !== bSeen) {
      // Empty string (never seen) comes first
      if (aSeen === "") return -1;
      if (bSeen === "") return 1;
      return aSeen.localeCompare(bSeen);
    }

    // Tertiary: question.number ASC
    return a.question.number - b.question.number;
  });

  // Mark weakness-based selections
  for (let i = 0; i < items.length; i++) {
    items[i].isWeaknessBased = i < count;
  }

  // Take top N
  return items.slice(0, Math.max(0, count));
}

/**
 * Sort questions by lastSeenAt (ascending) with deterministic tie-breaking.
 * Used for fallback selection when weakness-based selection doesn't fill quota.
 *
 * @param items - Review questions to sort
 * @returns Sorted array (least recently seen first)
 */
export function sortByLastSeen(items: ReviewQuestion[]): ReviewQuestion[] {
  return [...items].sort((a, b) => {
    // Primary: lastSeenAt ASC (empty = never seen = first)
    const aSeen = a.telemetry.lastSeenAt;
    const bSeen = b.telemetry.lastSeenAt;

    if (aSeen !== bSeen) {
      if (aSeen === "") return -1;
      if (bSeen === "") return 1;
      return aSeen.localeCompare(bSeen);
    }

    // Secondary: question.number ASC
    return a.question.number - b.question.number;
  });
}

/**
 * Select questions for review with fallback logic.
 *
 * If fewer than `count` questions have meaningful weakness scores,
 * fills the remainder with least recently seen questions.
 *
 * @param questions - All available questions
 * @param telemetryList - Existing telemetry
 * @param count - Target number of questions
 * @param weights - Weakness calculation weights
 * @returns Selected review questions (always exactly `count` if enough questions exist)
 */
export function selectReviewQuestions(
  questions: Question[],
  telemetryList: QuestionTelemetry[],
  count: number,
  weights: WeaknessWeights
): ReviewQuestion[] {
  // Generate weakness-based selection
  const weaknessBased = generateReviewQuestions(questions, telemetryList, count, weights);

  // If we have enough, return as-is
  if (weaknessBased.length >= count) {
    return weaknessBased;
  }

  // Need fallback: get least recently seen questions not already selected
  const selectedIds = new Set(weaknessBased.map((item) => item.question.number));

  // Create items for remaining questions
  const remaining: ReviewQuestion[] = questions
    .filter((q) => !selectedIds.has(q.number))
    .map((q) => {
      const existing = telemetryList.find((t) => t.questionNumber === q.number);
      const telemetry = existing ?? createEmptyTelemetry("exam", q.number);
      return {
        question: q,
        telemetry,
        weakness: 0,
        isWeaknessBased: false,
      };
    });

  // Sort by last seen (deterministic)
  const fallback = sortByLastSeen(remaining).slice(0, count - weaknessBased.length);

  // Combine weakness-based and fallback
  return [...weaknessBased, ...fallback];
}
