/**
 * Attempt Model - Domain types and utilities for attempt management
 *
 * Attempts represent persistent exam sessions (free, simulacro, review).
 * This module provides type definitions and factory functions for creating
 * valid attempt objects.
 */

import type { Attempt, AttemptType, AttemptConfig } from "./types.js";

/**
 * Re-export types for consumers
 */
export type { Attempt, AttemptType, AttemptConfig };

/**
 * Default attempt configuration values
 * These are centralized and user-configurable through settings
 */
export const DEFAULT_ATTEMPT_CONFIG: Required<
  Omit<AttemptConfig, "timeLimitMs" | "examWeights">
> & {
  timeLimitMs: undefined;
  examWeights: undefined;
} = {
  questionCount: 60,
  timeLimitMs: undefined,
  penalty: 0,
  reward: 1,
  examWeights: undefined,
};

/**
 * Valid attempt types
 */
export const ATTEMPT_TYPES: AttemptType[] = ["free", "simulacro", "review"];

/**
 * Type guard for AttemptType
 */
export function isAttemptType(value: unknown): value is AttemptType {
  return typeof value === "string" && ATTEMPT_TYPES.includes(value as AttemptType);
}

/**
 * Generate a deterministic UUID for attempts
 * Uses crypto.randomUUID() when available, with fallback for testing
 */
export function generateAttemptId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return `attempt-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Create a new attempt with validated defaults
 */
export function createAttempt(
  type: AttemptType,
  sourceExamIds: string[],
  config: AttemptConfig = {},
  parentAttemptId?: string
): Attempt {
  if (!isAttemptType(type)) {
    throw new Error(`Invalid attempt type: ${type}`);
  }

  if (!Array.isArray(sourceExamIds) || sourceExamIds.length === 0) {
    throw new Error("sourceExamIds must be a non-empty array");
  }

  if (sourceExamIds.some((id) => typeof id !== "string" || id.length === 0)) {
    throw new Error("All sourceExamIds must be non-empty strings");
  }

  if (parentAttemptId !== undefined && typeof parentAttemptId !== "string") {
    throw new Error("parentAttemptId must be a string if provided");
  }

  const now = new Date().toISOString();

  return {
    id: generateAttemptId(),
    type,
    createdAt: now,
    sourceExamIds: [...sourceExamIds], // Copy to avoid external mutation
    config: { ...config }, // Copy to avoid external mutation
    parentAttemptId,
  };
}

/**
 * Validate an attempt object structure
 * Returns true if valid, throws descriptive error if invalid
 */
export function validateAttempt(attempt: unknown): attempt is Attempt {
  if (typeof attempt !== "object" || attempt === null) {
    throw new Error("Attempt must be an object");
  }

  const a = attempt as Record<string, unknown>;

  // Check required fields exist
  if (typeof a.id !== "string" || a.id.length === 0) {
    throw new Error("Attempt must have a non-empty string 'id'");
  }

  if (!isAttemptType(a.type)) {
    throw new Error(`Attempt must have a valid 'type': ${ATTEMPT_TYPES.join(", ")}`);
  }

  if (typeof a.createdAt !== "string") {
    throw new Error("Attempt must have a string 'createdAt'");
  }

  // Validate ISO string format
  const date = new Date(a.createdAt);
  if (isNaN(date.getTime())) {
    throw new Error("Attempt 'createdAt' must be a valid ISO date string");
  }

  if (!Array.isArray(a.sourceExamIds) || a.sourceExamIds.length === 0) {
    throw new Error("Attempt must have a non-empty array 'sourceExamIds'");
  }

  if (a.sourceExamIds.some((id: unknown) => typeof id !== "string" || id.length === 0)) {
    throw new Error("All sourceExamIds must be non-empty strings");
  }

  if (typeof a.config !== "object" || a.config === null) {
    throw new Error("Attempt must have an object 'config'");
  }

  // Validate optional parentAttemptId
  if (a.parentAttemptId !== undefined && typeof a.parentAttemptId !== "string") {
    throw new Error("Attempt 'parentAttemptId' must be a string if provided");
  }

  // Validate config fields if present
  const config = a.config as Record<string, unknown>;

  if (config.questionCount !== undefined) {
    if (
      typeof config.questionCount !== "number" ||
      config.questionCount < 1 ||
      !Number.isInteger(config.questionCount)
    ) {
      throw new Error("config.questionCount must be a positive integer");
    }
  }

  if (config.timeLimitMs !== undefined) {
    if (
      typeof config.timeLimitMs !== "number" ||
      config.timeLimitMs < 0 ||
      !Number.isInteger(config.timeLimitMs)
    ) {
      throw new Error("config.timeLimitMs must be a non-negative integer");
    }
  }

  if (config.penalty !== undefined) {
    if (typeof config.penalty !== "number" || config.penalty < 0) {
      throw new Error("config.penalty must be a non-negative number");
    }
  }

  if (config.reward !== undefined) {
    if (typeof config.reward !== "number" || config.reward < 0) {
      throw new Error("config.reward must be a non-negative number");
    }
  }

  if (config.examWeights !== undefined) {
    if (typeof config.examWeights !== "object" || config.examWeights === null) {
      throw new Error("config.examWeights must be an object");
    }
    for (const [key, value] of Object.entries(config.examWeights)) {
      if (typeof value !== "number" || value < 0) {
        throw new Error(`config.examWeights["${key}"] must be a non-negative number`);
      }
    }
  }

  return true;
}

/**
 * Check if an attempt references a specific exam
 */
export function attemptReferencesExam(attempt: Attempt, examId: string): boolean {
  return attempt.sourceExamIds.includes(examId);
}

/**
 * Get the primary exam ID for an attempt
 * (the first exam in sourceExamIds)
 */
export function getPrimaryExamId(attempt: Attempt): string {
  return attempt.sourceExamIds[0];
}

/**
 * Check if an attempt is a child of another attempt
 */
export function isChildAttempt(attempt: Attempt, parentId: string): boolean {
  return attempt.parentAttemptId === parentId;
}
