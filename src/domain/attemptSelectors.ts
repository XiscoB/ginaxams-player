/**
 * Attempt Selectors - Pure functions for deriving statistics from Attempt data
 *
 * This module provides deterministic, testable selectors for extracting
 * exam statistics from Attempt history. Replaces legacy progress-based stats.
 *
 * Rules:
 * - All functions are pure (no side effects, no mutation)
 * - No DB logic
 * - No legacy progress dependencies
 * - Deterministic output for identical inputs
 */

import type { Attempt, AttemptResult } from "./types.js";

/**
 * Statistics derived from attempts for a specific exam
 */
export interface ExamAttemptStats {
  /** Total number of attempts for this exam */
  attemptCount: number;
  /** Score from the most recent attempt (if any completed) */
  lastScore?: number;
  /** Highest score across all attempts (if any completed) */
  bestScore?: number;
}

/**
 * Get attempt statistics for a specific exam.
 *
 * Filters attempts by examId, then derives:
 * - attemptCount: total attempts
 * - lastScore: score from most recent completed attempt
 * - bestScore: highest score across all completed attempts
 *
 * @param attempts - Array of all attempts
 * @param examId - The exam ID to filter by
 * @returns Statistics object, or undefined if no attempts exist
 */
export function getAttemptStatsForExam(
  attempts: Attempt[],
  examId: string
): ExamAttemptStats | undefined {
  // Filter attempts for this exam
  const examAttempts = attempts.filter((a) =>
    a.sourceExamIds.includes(examId)
  );

  if (examAttempts.length === 0) {
    return undefined;
  }

  // Get completed attempts with results
  const completedAttempts = examAttempts.filter(
    (a): a is Attempt & { result: AttemptResult } =>
      "result" in a && a.result !== undefined
  );

  // Calculate attempt count (all attempts, even incomplete)
  const attemptCount = examAttempts.length;

  // No completed attempts - return count only
  if (completedAttempts.length === 0) {
    return { attemptCount };
  }

  // Sort by createdAt to find most recent
  const sortedByDate = [...completedAttempts].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const lastAttempt = sortedByDate[0];
  const lastScore = lastAttempt.result.percentage;

  // Find best score
  const bestScore = Math.max(...completedAttempts.map((a) => a.result.percentage));

  return {
    attemptCount,
    lastScore,
    bestScore,
  };
}

/**
 * Get attempt counts for multiple exams at once.
 *
 * @param attempts - Array of all attempts
 * @param examIds - Array of exam IDs to get counts for
 * @returns Map of examId to attempt count
 */
export function getAttemptCounts(
  attempts: Attempt[],
  examIds: string[]
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const examId of examIds) {
    const examAttempts = attempts.filter((a) =>
      a.sourceExamIds.includes(examId)
    );
    counts.set(examId, examAttempts.length);
  }

  return counts;
}

/**
 * Check if an exam has any attempts.
 *
 * @param attempts - Array of all attempts
 * @param examId - The exam ID to check
 * @returns true if at least one attempt exists
 */
export function hasAttempts(attempts: Attempt[], examId: string): boolean {
  return attempts.some((a) => a.sourceExamIds.includes(examId));
}

/**
 * Get the most recent attempt for an exam.
 *
 * @param attempts - Array of all attempts
 * @param examId - The exam ID to filter by
 * @returns The most recent attempt, or undefined if none exists
 */
export function getMostRecentAttempt(
  attempts: Attempt[],
  examId: string
): Attempt | undefined {
  const examAttempts = attempts.filter((a) =>
    a.sourceExamIds.includes(examId)
  );

  if (examAttempts.length === 0) {
    return undefined;
  }

  return examAttempts.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )[0];
}
