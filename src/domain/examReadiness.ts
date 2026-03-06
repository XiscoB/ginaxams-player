/**
 * Exam Readiness Estimation — Phase 9
 *
 * Derives an exam readiness score from multiple signals:
 *   - Average category mastery (40% weight)
 *   - Recent simulacro accuracy (40% weight)
 *   - Weakness recovery rate (20% weight)
 *
 * Formula:
 *   readinessScore = (avgCategoryMastery × 40)
 *                  + (recentSimulacroAccuracy × 40)
 *                  + (weaknessRecoveryRate × 20)
 *
 * Classification:
 *    0–40  → not_ready
 *   40–60  → almost_ready
 *   60–80  → ready
 *   80–100 → exam_ready
 *
 * Rules:
 * - All functions are pure (no side effects, no mutation of inputs)
 * - Deterministic: same inputs → same outputs
 * - No imports from defaults.ts (config injected via arguments)
 * - No DOM, storage, or i18n dependencies
 * - Only simulacro attempts are considered for accuracy
 */

import type { Attempt, QuestionTelemetry, CategoryMastery } from "./types.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Readiness classification level.
 */
export type ReadinessLevel =
  | "not_ready"
  | "almost_ready"
  | "ready"
  | "exam_ready";

/**
 * Computed exam readiness result.
 */
export interface ExamReadiness {
  readinessScore: number;
  readinessLevel: ReadinessLevel;
}

/**
 * Configuration for readiness computation.
 * Injected to keep functions pure and configurable.
 */
export interface ReadinessConfig {
  /** Number of recent simulacro attempts to consider */
  simulacroWindow: number;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Compute the average category mastery as a ratio in [0, 1].
 *
 * Mastery levels are converted to numeric scores:
 *   mastered → 1.0
 *   learning → 0.5
 *   weak     → 0.0
 *
 * @param categoryMastery - Pre-computed category mastery data
 * @returns Average mastery ratio in [0, 1], or 0 if no categories
 */
export function computeAvgCategoryMastery(
  categoryMastery: ReadonlyArray<CategoryMastery>,
): number {
  if (categoryMastery.length === 0) {
    return 0;
  }

  let total = 0;
  for (const cm of categoryMastery) {
    switch (cm.level) {
      case "mastered":
        total += 1.0;
        break;
      case "learning":
        total += 0.5;
        break;
      case "weak":
        total += 0.0;
        break;
    }
  }

  return total / categoryMastery.length;
}

/**
 * Compute recent simulacro accuracy from the last N simulacro attempts.
 *
 * Only attempts of type "simulacro" with a result are considered.
 * Attempts are sorted by createdAt descending, and the last N are used.
 * Accuracy is the average percentage (0–100) normalized to [0, 1].
 *
 * @param attempts - All attempts (filtered to simulacro internally)
 * @param simulacroWindow - Number of recent simulacros to consider
 * @returns Accuracy ratio in [0, 1], or 0 if no qualifying attempts
 */
export function computeRecentSimulacroAccuracy(
  attempts: ReadonlyArray<Attempt>,
  simulacroWindow: number,
): number {
  // Filter to simulacro attempts with results
  const simulacros = attempts
    .filter(
      (
        a,
      ): a is Attempt & {
        type: "simulacro";
        result: NonNullable<Attempt["result"]>;
      } => a.type === "simulacro" && a.result !== undefined,
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const recent = simulacros.slice(0, simulacroWindow);

  if (recent.length === 0) {
    return 0;
  }

  let totalPercentage = 0;
  for (const attempt of recent) {
    totalPercentage += attempt.result.percentage;
  }

  // percentage is 0–100, normalize to 0–1
  return totalPercentage / (recent.length * 100);
}

/**
 * Compute the weakness recovery rate from telemetry.
 *
 * Recovery rate measures how well the user is improving on questions
 * they have seen. It uses the consecutiveCorrect metric as an
 * indicator of learning progress.
 *
 * Formula:
 *   For each seen question: min(consecutiveCorrect / 3, 1)
 *   Average across all seen questions
 *
 * This gives a ratio in [0, 1] where:
 *   0 = no recovery (no consecutive correct answers)
 *   1 = full recovery (3+ consecutive correct on all seen questions)
 *
 * @param telemetry - All question telemetry
 * @returns Recovery rate in [0, 1], or 0 if no seen questions
 */
export function computeWeaknessRecoveryRate(
  telemetry: ReadonlyArray<QuestionTelemetry>,
): number {
  const seenQuestions = telemetry.filter((t) => t.totalSeen > 0);

  if (seenQuestions.length === 0) {
    return 0;
  }

  let totalRecovery = 0;
  for (const t of seenQuestions) {
    // Cap at 3 consecutive correct for full recovery
    totalRecovery += Math.min(t.consecutiveCorrect / 3, 1);
  }

  return totalRecovery / seenQuestions.length;
}

/**
 * Classify a readiness score into a discrete level.
 *
 * Thresholds:
 *    [0, 40)   → not_ready
 *   [40, 60)   → almost_ready
 *   [60, 80)   → ready
 *   [80, 100]  → exam_ready
 *
 * @param score - Readiness score in [0, 100]
 * @returns ReadinessLevel classification
 */
export function classifyReadiness(score: number): ReadinessLevel {
  if (score >= 80) {
    return "exam_ready";
  }
  if (score >= 60) {
    return "ready";
  }
  if (score >= 40) {
    return "almost_ready";
  }
  return "not_ready";
}

/**
 * Compute the overall exam readiness score and classification.
 *
 * Formula:
 *   readinessScore = (avgCategoryMastery × 40)
 *                  + (recentSimulacroAccuracy × 40)
 *                  + (weaknessRecoveryRate × 20)
 *
 * Result is clamped to [0, 100].
 *
 * @param categoryMastery - Pre-computed category mastery data
 * @param attempts - All attempts (simulacro filtered internally)
 * @param telemetry - All question telemetry
 * @param config - Readiness configuration (injected)
 * @returns ExamReadiness with score and classification
 */
export function computeExamReadiness(
  categoryMastery: ReadonlyArray<CategoryMastery>,
  attempts: ReadonlyArray<Attempt>,
  telemetry: ReadonlyArray<QuestionTelemetry>,
  config: ReadinessConfig,
): ExamReadiness {
  const avgMastery = computeAvgCategoryMastery(categoryMastery);
  const simulacroAccuracy = computeRecentSimulacroAccuracy(
    attempts,
    config.simulacroWindow,
  );
  const recoveryRate = computeWeaknessRecoveryRate(telemetry);

  const raw = avgMastery * 40 + simulacroAccuracy * 40 + recoveryRate * 20;

  const readinessScore = Math.max(
    0,
    Math.min(100, Math.round(raw * 100) / 100),
  );
  const readinessLevel = classifyReadiness(readinessScore);

  return {
    readinessScore,
    readinessLevel,
  };
}
