/**
 * Attempt Model - Domain types and utilities for attempt management
 *
 * Attempts represent persistent exam sessions (free, simulacro, review).
 * This module provides type definitions and factory functions for creating
 * valid attempt objects.
 */

import type {
  Attempt,
  AttemptType,
  SimulacroAttempt,
  ReviewAttempt,
  FreeAttempt,
  SimulacroAttemptConfig,
  ReviewAttemptConfig,
  FreeAttemptConfig,
} from "./types.js";

/**
 * Re-export types for consumers
 */
export type {
  Attempt,
  AttemptType,
  SimulacroAttempt,
  ReviewAttempt,
  FreeAttempt,
  SimulacroAttemptConfig,
  ReviewAttemptConfig,
  FreeAttemptConfig,
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

// ============================================================================
// createAttempt Function Overloads
// ============================================================================

/**
 * Create a new simulacro attempt.
 * ALL config fields are required for reproducibility.
 */
export function createAttempt(
  type: "simulacro",
  sourceExamIds: string[],
  config: SimulacroAttemptConfig
): SimulacroAttempt;

/**
 * Create a new review attempt.
 */
export function createAttempt(
  type: "review",
  sourceExamIds: string[],
  config: ReviewAttemptConfig,
  parentAttemptId?: string
): ReviewAttempt;

/**
 * Create a new free attempt.
 */
export function createAttempt(
  type: "free",
  sourceExamIds: string[]
): FreeAttempt;

/**
 * Implementation
 */
export function createAttempt(
  type: AttemptType,
  sourceExamIds: string[],
  config?: SimulacroAttemptConfig | ReviewAttemptConfig | FreeAttemptConfig,
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

  // Validate simulacro config is complete
  if (type === "simulacro") {
    if (!config) {
      throw new Error("Simulacro attempt requires a complete config");
    }
    const simConfig = config as SimulacroAttemptConfig;
    if (
      typeof simConfig.questionCount !== "number" ||
      typeof simConfig.timeLimitMs !== "number" ||
      typeof simConfig.penalty !== "number" ||
      typeof simConfig.reward !== "number" ||
      typeof simConfig.examWeights !== "object" ||
      simConfig.examWeights === null
    ) {
      throw new Error(
        "Simulacro config must include: questionCount, timeLimitMs, penalty, reward, examWeights"
      );
    }
  }

  // Validate review config
  if (type === "review") {
    if (!config) {
      throw new Error("Review attempt requires a config with questionCount and weights");
    }
    const revConfig = config as ReviewAttemptConfig;
    if (typeof revConfig.questionCount !== "number") {
      throw new Error("Review config must include questionCount");
    }
    if (
      typeof revConfig.weights !== "object" ||
      revConfig.weights === null ||
      typeof revConfig.weights.wrongWeight !== "number" ||
      typeof revConfig.weights.blankWeight !== "number" ||
      typeof revConfig.weights.recoveryWeight !== "number" ||
      typeof revConfig.weights.weakTimeThresholdMs !== "number"
    ) {
      throw new Error(
        "Review config must include weights with wrongWeight, blankWeight, recoveryWeight, and weakTimeThresholdMs"
      );
    }
  }

  const now = new Date().toISOString();

  return {
    id: generateAttemptId(),
    type,
    createdAt: now,
    sourceExamIds: [...sourceExamIds],
    config: config ? { ...config } : {},
    parentAttemptId,
  } as Attempt;
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

  // Type-specific validation
  if (a.type === "simulacro") {
    const config = a.config as Record<string, unknown>;
    if (typeof config.questionCount !== "number") {
      throw new Error("Simulacro config.questionCount must be a number");
    }
    if (typeof config.timeLimitMs !== "number") {
      throw new Error("Simulacro config.timeLimitMs must be a number");
    }
    if (typeof config.penalty !== "number") {
      throw new Error("Simulacro config.penalty must be a number");
    }
    if (typeof config.reward !== "number") {
      throw new Error("Simulacro config.reward must be a number");
    }
    if (typeof config.examWeights !== "object" || config.examWeights === null) {
      throw new Error("Simulacro config.examWeights must be an object");
    }
  }

  if (a.type === "review") {
    const config = a.config as Record<string, unknown>;
    if (typeof config.questionCount !== "number") {
      throw new Error("Review config.questionCount must be a number");
    }
    if (typeof config.weights !== "object" || config.weights === null) {
      throw new Error("Review config.weights must be an object");
    }
    const weights = config.weights as Record<string, unknown>;
    if (typeof weights.wrongWeight !== "number") {
      throw new Error("Review config.weights.wrongWeight must be a number");
    }
    if (typeof weights.blankWeight !== "number") {
      throw new Error("Review config.weights.blankWeight must be a number");
    }
    if (typeof weights.recoveryWeight !== "number") {
      throw new Error("Review config.weights.recoveryWeight must be a number");
    }
    if (typeof weights.weakTimeThresholdMs !== "number") {
      throw new Error("Review config.weights.weakTimeThresholdMs must be a number");
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
