/**
 * Scoring Module - Pure functions for score calculation
 *
 * All functions in this module are pure - they have no side effects
 * and depend only on their inputs. They are fully testable without
 * any DOM or storage dependencies.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Parameters for calculateScore
 * All parameters are required except blankPenalty which defaults to 0
 */
export interface CalculateScoreParams {
  /** Number of correct answers */
  correct: number;
  /** Number of wrong answers */
  wrong: number;
  /** Number of blank (unanswered) questions */
  blank: number;
  /** Points awarded for each correct answer */
  reward: number;
  /** Points deducted for each wrong answer */
  penalty: number;
  /** Points deducted for each blank answer (defaults to 0) */
  blankPenalty?: number;
}

// ============================================================================
// Score Calculation
// ============================================================================

/**
 * Calculate score based on correct answers, wrong answers, and blank answers.
 *
 * Rules:
 * - Base formula: (correct * reward) - (wrong * penalty) - (blank * blankPenalty)
 * - Blank is neutral by default (blankPenalty defaults to 0)
 * - Score can go negative (no clamping)
 * - No mutation of input parameters
 * - Fully deterministic
 *
 * @param params - Object containing correct, wrong, blank, reward, penalty, and optional blankPenalty
 * @returns The calculated score (can be negative)
 */
export function calculateScore(params: CalculateScoreParams): number {
  const { correct, wrong, blank, reward, penalty, blankPenalty = 0 } = params;
  return correct * reward - wrong * penalty - blank * blankPenalty;
}

/**
 * Calculate score percentage based on correct answers out of total.
 * Returns value between 0 and 100.
 *
 * @param correct - Number of correct answers
 * @param total - Total number of questions
 * @returns Percentage score (0-100), rounded to nearest integer
 */
export function calculatePercentage(correct: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((100 * correct) / total);
}

/**
 * Determine the score category based on percentage.
 *
 * @param percentage - Score percentage (0-100)
 * @returns "good" | "medium" | "bad" based on thresholds
 */
export function getScoreCategory(percentage: number): "good" | "medium" | "bad" {
  if (percentage >= 70) return "good";
  if (percentage >= 50) return "medium";
  return "bad";
}

/**
 * Get the color associated with a score category.
 *
 * @param category - The score category
 * @returns CSS color value
 */
export function getScoreColor(category: "good" | "medium" | "bad"): string {
  const colors = {
    good: "var(--accent-secondary)", // #00ff88
    medium: "#ffd700",
    bad: "#ff6b6b",
  };
  return colors[category];
}

// ============================================================================
// Weight Normalization (Legacy - prefer distribution.ts)
// ============================================================================

/**
 * Normalize exam weights so they sum to 1.0.
 * If no weights are provided, distributes evenly.
 *
 * @param examIds - Array of exam IDs to normalize
 * @param weights - Optional record of exam IDs to their weights
 * @returns Normalized weights that sum to 1.0
 * @deprecated Use normalizeWeights from distribution.ts for new code
 */
export function normalizeWeights(
  examIds: string[],
  weights?: Record<string, number>
): Record<string, number> {
  const normalized: Record<string, number> = {};

  if (!examIds.length) {
    return normalized;
  }

  // If no weights provided, use equal distribution
  if (!weights) {
    const equalWeight = 1 / examIds.length;
    examIds.forEach((id) => {
      normalized[id] = equalWeight;
    });
    return normalized;
  }

  // Sum all provided weights for exams in the list
  let totalWeight = 0;
  examIds.forEach((id) => {
    const weight = weights[id] ?? 1;
    totalWeight += weight;
  });

  // Normalize so sum = 1.0
  if (totalWeight === 0) {
    const equalWeight = 1 / examIds.length;
    examIds.forEach((id) => {
      normalized[id] = equalWeight;
    });
    return normalized;
  }

  examIds.forEach((id) => {
    const weight = weights[id] ?? 1;
    normalized[id] = weight / totalWeight;
  });

  return normalized;
}

// ============================================================================
// Question Distribution (Legacy - prefer distribution.ts)
// ============================================================================

/**
 * Calculate the weighted distribution of questions across exams.
 * Used for simulacro mode to determine how many questions to take
 * from each exam.
 *
 * @param totalQuestions - Total number of questions to distribute
 * @param examIds - Array of available exam IDs
 * @param weights - Optional weights for each exam
 * @returns Record mapping exam IDs to question counts
 * @deprecated Use allocateQuestionCounts from distribution.ts for new code
 */
export function distributeQuestions(
  totalQuestions: number,
  examIds: string[],
  weights?: Record<string, number>
): Record<string, number> {
  if (totalQuestions <= 0 || examIds.length === 0) {
    return {};
  }

  const normalized = normalizeWeights(examIds, weights);
  const distribution: Record<string, number> = {};

  // Calculate initial distribution
  let assigned = 0;
  const allocations: { id: string; allocation: number; fraction: number }[] = [];

  examIds.forEach((id) => {
    const exact = totalQuestions * normalized[id];
    const floor = Math.floor(exact);
    allocations.push({
      id,
      allocation: floor,
      fraction: exact - floor,
    });
    assigned += floor;
  });

  // Distribute remaining questions by largest remainder
  const remaining = totalQuestions - assigned;
  allocations.sort((a, b) => b.fraction - a.fraction);

  for (let i = 0; i < remaining; i++) {
    if (i < allocations.length) {
      allocations[i].allocation += 1;
    }
  }

  // Build final distribution
  allocations.forEach(({ id, allocation }) => {
    distribution[id] = allocation;
  });

  return distribution;
}

// ============================================================================
// Array Utilities
// ============================================================================

/**
 * Deterministic random shuffle using Fisher-Yates algorithm.
 * Creates a new array without mutating the original.
 *
 * @param array - Array to shuffle
 * @param rng - Optional random number generator (defaults to Math.random)
 * @returns New shuffled array
 */
export function shuffleArray<T>(
  array: readonly T[],
  rng: () => number = Math.random
): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}


