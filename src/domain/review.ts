/**
 * Review Generation Module - Adaptive question selection for review mode
 *
 * This module implements the adaptive review engine that selects questions
 * based on weakness scores computed from telemetry data.
 *
 * All functions are pure and deterministic - no randomness allowed.
 */

import type { QuestionTelemetry } from "./types.js";
import { computeWeakScore, type WeaknessWeights } from "./weakness.js";

/**
 * Input parameters for review question set generation.
 * All fields are required for deterministic operation.
 */
export interface ReviewGenerationInput {
  /** Map of question ID to telemetry data */
  telemetryByQuestionId: Record<string, QuestionTelemetry>;
  /** Full question bank with IDs and their exam associations */
  questionBank: {
    id: string;
    examId: string;
  }[];
  /** Selected exam IDs to include in the review */
  selectedExamIds: string[];
  /** Number of questions to include in the review set */
  reviewQuestionCount: number;
  /** Weights for weakness calculation */
  weights: WeaknessWeights;
}

/**
 * Internal structure for sorting questions with their computed scores.
 */
interface QuestionWithScore {
  id: string;
  examId: string;
  weakScore: number;
  totalSeen: number;
  lastSeenAt: number | null;
}

/**
 * Parse a lastSeenAt string into a timestamp number.
 * Returns null for empty strings (never seen).
 *
 * @param lastSeenAt - ISO date string or empty string
 * @returns Timestamp in milliseconds or null
 */
function parseLastSeenAt(lastSeenAt: string): number | null {
  if (lastSeenAt === "" || lastSeenAt === undefined || lastSeenAt === null) {
    return null;
  }
  const timestamp = Date.parse(lastSeenAt);
  return isNaN(timestamp) ? null : timestamp;
}

/**
 * Compare two questions for sorting by weakness.
 * Implements the M4 tie-breaking rules deterministically.
 *
 * Tie-breaking order:
 * 1. Higher weakScore first
 * 2. Lower totalSeen first
 * 3. Older lastSeenAt first (null = never seen comes first)
 * 4. Lexicographical ID (ascending)
 *
 * @param a - First question with score
 * @param b - Second question with score
 * @returns Negative if a comes before b, positive if b comes before a
 */
function compareByWeakness(
  a: QuestionWithScore,
  b: QuestionWithScore
): number {
  // 1. Higher weakScore first
  if (a.weakScore !== b.weakScore) {
    return b.weakScore - a.weakScore;
  }

  // 2. Lower totalSeen first
  if (a.totalSeen !== b.totalSeen) {
    return a.totalSeen - b.totalSeen;
  }

  // 3. Older lastSeenAt first (null represents never seen, comes first)
  const aTime = a.lastSeenAt;
  const bTime = b.lastSeenAt;

  if (aTime !== bTime) {
    if (aTime === null) return -1; // a (never seen) comes first
    if (bTime === null) return 1; // b (never seen) comes first
    return aTime - bTime; // Older timestamp comes first
  }

  // 4. Finally lexicographical ID (ascending for stability)
  return a.id.localeCompare(b.id);
}

/**
 * Compare two questions for sorting by least recently seen.
 * Used as fallback when there are insufficient weak questions.
 *
 * Sorting order:
 * 1. Older lastSeenAt first (null = never seen comes first)
 * 2. Lexicographical ID (ascending)
 *
 * @param a - First question with score
 * @param b - Second question with score
 * @returns Negative if a comes before b, positive if b comes before a
 */
function compareByLastSeen(
  a: QuestionWithScore,
  b: QuestionWithScore
): number {
  // 1. Older lastSeenAt first (null represents never seen, comes first)
  const aTime = a.lastSeenAt;
  const bTime = b.lastSeenAt;

  if (aTime !== bTime) {
    if (aTime === null) return -1;
    if (bTime === null) return 1;
    return aTime - bTime;
  }

  // 2. Lexicographical ID (ascending for stability)
  return a.id.localeCompare(b.id);
}

/**
 * Generate a review question set based on weakness scores.
 *
 * Flow:
 * 1. Filter questions by selectedExamIds
 * 2. Compute weakScore for each question
 * 3. Sort by weakScore DESC (with tie-breaking rules)
 * 4. Take top N (reviewQuestionCount)
 * 5. If insufficient: fill remaining with least recently seen (lastSeenAt ASC, null first)
 * 6. Return ordered list of question IDs
 *
 * DETERMINISM REQUIREMENTS:
 * - Sorting must be stable
 * - Tie-breaking rules must be deterministic
 * - No randomness
 * - Review must be reproducible
 *
 * CRITICAL RULES:
 * - Must be PURE (no side effects, no mutation of inputs)
 * - Must NOT mutate telemetry
 * - No hidden global state
 * - No hardcoded numbers
 *
 * @param input - Review generation input parameters
 * @returns Ordered array of question IDs for the review set
 */
export function generateReviewQuestionSet(
  input: ReviewGenerationInput
): string[] {
  const {
    telemetryByQuestionId,
    questionBank,
    selectedExamIds,
    reviewQuestionCount,
    weights,
  } = input;

  // Create a Set for O(1) lookup of selected exam IDs
  const selectedExamIdSet = new Set(selectedExamIds);

  // Filter questions by selectedExamIds and compute scores
  const questionsWithScores: QuestionWithScore[] = questionBank
    .filter((q) => selectedExamIdSet.has(q.examId))
    .map((q) => {
      const telemetry = telemetryByQuestionId[q.id];

      if (telemetry) {
        return {
          id: q.id,
          examId: q.examId,
          weakScore: computeWeakScore(telemetry, weights),
          totalSeen: telemetry.totalSeen,
          lastSeenAt: parseLastSeenAt(telemetry.lastSeenAt),
        };
      } else {
        // No telemetry = never seen, default to zero weakness but null lastSeen
        return {
          id: q.id,
          examId: q.examId,
          weakScore: 0,
          totalSeen: 0,
          lastSeenAt: null,
        };
      }
    });

  // If we don't have enough questions, return all of them sorted by weakness
  if (questionsWithScores.length <= reviewQuestionCount) {
    questionsWithScores.sort(compareByWeakness);
    return questionsWithScores.map((q) => q.id);
  }

  // Sort by weakness to get top N
  questionsWithScores.sort(compareByWeakness);

  // Take top N by weakness
  const selectedByWeakness = questionsWithScores.slice(0, reviewQuestionCount);

  // If we have enough from weakness sorting, return them
  if (selectedByWeakness.length === reviewQuestionCount) {
    return selectedByWeakness.map((q) => q.id);
  }

  // If insufficient weak questions, fill with least recently seen from remaining
  const selectedIds = new Set(selectedByWeakness.map((q) => q.id));
  const remaining = questionsWithScores.filter((q) => !selectedIds.has(q.id));

  // Sort remaining by least recently seen
  remaining.sort(compareByLastSeen);

  // Fill up to reviewQuestionCount
  const needed = reviewQuestionCount - selectedByWeakness.length;
  const fillQuestions = remaining.slice(0, needed);

  // Combine and return IDs
  return [...selectedByWeakness, ...fillQuestions].map((q) => q.id);
}

/**
 * Generate a review question set with detailed scoring information.
 * Useful for debugging and displaying weakness scores to users.
 *
 * @param input - Review generation input parameters
 * @returns Array of question IDs with their weakness scores
 */
export function generateReviewQuestionSetWithScores(
  input: ReviewGenerationInput
): Array<{
  id: string;
  weakScore: number;
  totalSeen: number;
  lastSeenAt: number | null;
}> {
  const {
    telemetryByQuestionId,
    questionBank,
    selectedExamIds,
    reviewQuestionCount,
    weights,
  } = input;

  const selectedExamIdSet = new Set(selectedExamIds);

  const questionsWithScores: QuestionWithScore[] = questionBank
    .filter((q) => selectedExamIdSet.has(q.examId))
    .map((q) => {
      const telemetry = telemetryByQuestionId[q.id];

      if (telemetry) {
        return {
          id: q.id,
          examId: q.examId,
          weakScore: computeWeakScore(telemetry, weights),
          totalSeen: telemetry.totalSeen,
          lastSeenAt: parseLastSeenAt(telemetry.lastSeenAt),
        };
      } else {
        return {
          id: q.id,
          examId: q.examId,
          weakScore: 0,
          totalSeen: 0,
          lastSeenAt: null,
        };
      }
    });

  if (questionsWithScores.length <= reviewQuestionCount) {
    questionsWithScores.sort(compareByWeakness);
    return questionsWithScores.map((q) => ({
      id: q.id,
      weakScore: q.weakScore,
      totalSeen: q.totalSeen,
      lastSeenAt: q.lastSeenAt,
    }));
  }

  questionsWithScores.sort(compareByWeakness);
  const selectedByWeakness = questionsWithScores.slice(0, reviewQuestionCount);

  if (selectedByWeakness.length === reviewQuestionCount) {
    return selectedByWeakness.map((q) => ({
      id: q.id,
      weakScore: q.weakScore,
      totalSeen: q.totalSeen,
      lastSeenAt: q.lastSeenAt,
    }));
  }

  const selectedIds = new Set(selectedByWeakness.map((q) => q.id));
  const remaining = questionsWithScores.filter((q) => !selectedIds.has(q.id));
  remaining.sort(compareByLastSeen);

  const needed = reviewQuestionCount - selectedByWeakness.length;
  const fillQuestions = remaining.slice(0, needed);

  return [...selectedByWeakness, ...fillQuestions].map((q) => ({
    id: q.id,
    weakScore: q.weakScore,
    totalSeen: q.totalSeen,
    lastSeenAt: q.lastSeenAt,
  }));
}
