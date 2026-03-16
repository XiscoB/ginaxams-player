/**
 * Telemetry Model - Domain types and utilities for question telemetry
 *
 * QuestionTelemetry tracks per-question performance metrics including
 * correctness counts, consecutive streaks, and response times.
 *
 * Rules:
 * - id format: "${examId}::${questionNumber}"
 * - avgResponseTimeMs uses rolling average calculation
 * - No derived fields stored (weakness is runtime only)
 * - Historical mistake counts are never deleted
 */

import type { QuestionTelemetry } from "./types.js";

/**
 * Re-export type for consumers
 */
export type { QuestionTelemetry };

/**
 * Generate the telemetry ID from examId and questionNumber
 * Format: "${examId}::${questionNumber}"
 */
export function generateTelemetryId(
  examId: string,
  questionNumber: number
): string {
  if (typeof examId !== "string" || examId.length === 0) {
    throw new Error("examId must be a non-empty string");
  }
  if (
    typeof questionNumber !== "number" ||
    !Number.isInteger(questionNumber) ||
    questionNumber < 1
  ) {
    throw new Error("questionNumber must be a positive integer");
  }
  return `${examId}::${questionNumber}`;
}

/**
 * Parse a telemetry ID into its components
 */
export function parseTelemetryId(
  id: string
): { examId: string; questionNumber: number } {
  const parts = id.split("::");
  if (parts.length !== 2) {
    throw new Error(`Invalid telemetry ID format: ${id}`);
  }
  const questionNumber = parseInt(parts[1], 10);
  if (isNaN(questionNumber)) {
    throw new Error(`Invalid question number in telemetry ID: ${id}`);
  }
  return { examId: parts[0], questionNumber };
}

/**
 * Create initial telemetry for a question
 */
export function createInitialTelemetry(
  examId: string,
  questionNumber: number
): QuestionTelemetry {
  if (typeof examId !== "string" || examId.length === 0) {
    throw new Error("examId must be a non-empty string");
  }
  if (
    typeof questionNumber !== "number" ||
    !Number.isInteger(questionNumber) ||
    questionNumber < 1
  ) {
    throw new Error("questionNumber must be a positive integer");
  }

  return {
    id: generateTelemetryId(examId, questionNumber),
    examId,
    questionNumber,
    timesCorrect: 0,
    timesWrong: 0,
    timesBlank: 0,
    consecutiveCorrect: 0,
    avgResponseTimeMs: 0,
    totalSeen: 0,
    lastSeenAt: "", // Empty string indicates never seen
  };
}

/**
 * Validate a QuestionTelemetry object
 * Returns true if valid, throws descriptive error if invalid
 */
export function validateQuestionTelemetry(
  telemetry: unknown
): telemetry is QuestionTelemetry {
  if (typeof telemetry !== "object" || telemetry === null) {
    throw new Error("QuestionTelemetry must be an object");
  }

  const t = telemetry as Record<string, unknown>;

  // Check required fields exist
  if (typeof t.id !== "string" || t.id.length === 0) {
    throw new Error("QuestionTelemetry must have a non-empty string 'id'");
  }

  // Validate ID format
  try {
    parseTelemetryId(t.id);
  } catch {
    throw new Error(`QuestionTelemetry 'id' has invalid format: ${t.id}`);
  }

  if (typeof t.examId !== "string" || t.examId.length === 0) {
    throw new Error("QuestionTelemetry must have a non-empty string 'examId'");
  }

  if (
    typeof t.questionNumber !== "number" ||
    !Number.isInteger(t.questionNumber) ||
    t.questionNumber < 1
  ) {
    throw new Error("QuestionTelemetry must have a positive integer 'questionNumber'");
  }

  // Validate ID matches components
  const expectedId = generateTelemetryId(t.examId, t.questionNumber);
  if (t.id !== expectedId) {
    throw new Error(
      `QuestionTelemetry 'id' (${t.id}) does not match examId (${t.examId}) and questionNumber (${t.questionNumber})`
    );
  }

  // Validate numeric counters
  if (
    typeof t.timesCorrect !== "number" ||
    !Number.isInteger(t.timesCorrect) ||
    t.timesCorrect < 0
  ) {
    throw new Error("QuestionTelemetry 'timesCorrect' must be a non-negative integer");
  }

  if (
    typeof t.timesWrong !== "number" ||
    !Number.isInteger(t.timesWrong) ||
    t.timesWrong < 0
  ) {
    throw new Error("QuestionTelemetry 'timesWrong' must be a non-negative integer");
  }

  if (
    typeof t.timesBlank !== "number" ||
    !Number.isInteger(t.timesBlank) ||
    t.timesBlank < 0
  ) {
    throw new Error("QuestionTelemetry 'timesBlank' must be a non-negative integer");
  }

  if (
    typeof t.consecutiveCorrect !== "number" ||
    !Number.isInteger(t.consecutiveCorrect) ||
    t.consecutiveCorrect < 0
  ) {
    throw new Error(
      "QuestionTelemetry 'consecutiveCorrect' must be a non-negative integer"
    );
  }

  if (typeof t.avgResponseTimeMs !== "number" || t.avgResponseTimeMs < 0) {
    throw new Error("QuestionTelemetry 'avgResponseTimeMs' must be a non-negative number");
  }

  if (
    typeof t.totalSeen !== "number" ||
    !Number.isInteger(t.totalSeen) ||
    t.totalSeen < 0
  ) {
    throw new Error("QuestionTelemetry 'totalSeen' must be a non-negative integer");
  }

  if (typeof t.lastSeenAt !== "string") {
    throw new Error("QuestionTelemetry 'lastSeenAt' must be a string");
  }

  // Validate lastSeenAt is valid ISO string if not empty
  if (t.lastSeenAt.length > 0) {
    const date = new Date(t.lastSeenAt);
    if (isNaN(date.getTime())) {
      throw new Error("QuestionTelemetry 'lastSeenAt' must be a valid ISO date string");
    }
  }

  // Validate consistency: totalSeen should equal sum of outcomes
  const totalOutcomes = t.timesCorrect + t.timesWrong + t.timesBlank;
  if (t.totalSeen !== totalOutcomes) {
    throw new Error(
      `QuestionTelemetry 'totalSeen' (${t.totalSeen}) must equal sum of outcomes (${totalOutcomes})`
    );
  }

  return true;
}

/**
 * Calculate rolling average for response time
 * Formula: newAvg = ((oldAvg * (totalSeen - 1)) + newValue) / totalSeen
 */
export function calculateRollingAverage(
  currentAverage: number,
  totalSeen: number,
  newValue: number
): number {
  if (totalSeen < 1) {
    throw new Error("totalSeen must be at least 1 for rolling average calculation");
  }
  if (totalSeen === 1) {
    return newValue;
  }
  return (currentAverage * (totalSeen - 1) + newValue) / totalSeen;
}

/**
 * Type guard for QuestionTelemetry
 */
export function isQuestionTelemetry(value: unknown): value is QuestionTelemetry {
  try {
    return validateQuestionTelemetry(value);
  } catch {
    return false;
  }
}

/**
 * Get telemetry entries for a specific exam
 * Pure filter helper
 */
export function filterTelemetryByExam(
  telemetry: QuestionTelemetry[],
  examId: string
): QuestionTelemetry[] {
  return telemetry.filter((t) => t.examId === examId);
}

/**
 * Remove telemetry entries for a specific exam
 * Pure filter helper - returns new array without matching entries
 */
export function removeTelemetryForExam(
  telemetry: QuestionTelemetry[],
  examId: string
): QuestionTelemetry[] {
  return telemetry.filter((t) => t.examId !== examId);
}

/**
 * Check if a question has been seen (totalSeen > 0)
 */
export function hasBeenSeen(telemetry: QuestionTelemetry): boolean {
  return telemetry.totalSeen > 0;
}

/**
 * Get the accuracy ratio for a question
 * Returns 0 if never seen, otherwise correct / totalSeen
 */
export function getAccuracyRatio(telemetry: QuestionTelemetry): number {
  if (telemetry.totalSeen === 0) {
    return 0;
  }
  return telemetry.timesCorrect / telemetry.totalSeen;
}
