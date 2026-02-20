/**
 * Scoring Module - Pure functions for score calculation
 * 
 * All functions in this module are pure - they have no side effects
 * and depend only on their inputs. They are fully testable without
 * any DOM or storage dependencies.
 */

/**
 * Calculate score based on correct answers, wrong answers, and blank answers
 * using the standard scoring formula.
 * 
 * @param correct - Number of correct answers
 * @param wrong - Number of wrong answers  
 * @param _blank - Number of blank (unanswered) questions (unused but kept for API compatibility)
 * @param reward - Points awarded for each correct answer (default: 1)
 * @param penalty - Points deducted for each wrong answer (default: 0)
 * @returns The calculated score
 */
export function calculateScore(
  correct: number,
  wrong: number,
  _blank: number,
  reward: number = 1,
  penalty: number = 0
): number {
  return correct * reward - wrong * penalty;
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

/**
 * Normalize exam weights so they sum to 1.0.
 * If no weights are provided, distributes evenly.
 * 
 * @param examIds - Array of exam IDs to normalize
 * @param weights - Optional record of exam IDs to their weights
 * @returns Normalized weights that sum to 1.0
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

/**
 * Calculate the weighted distribution of questions across exams.
 * Used for simulacro mode to determine how many questions to take
 * from each exam.
 * 
 * @param totalQuestions - Total number of questions to distribute
 * @param examIds - Array of available exam IDs
 * @param weights - Optional weights for each exam
 * @returns Record mapping exam IDs to question counts
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

/**
 * Create a seeded random number generator for reproducible shuffling.
 * Uses a simple LCG (Linear Congruential Generator) algorithm.
 * 
 * @param seed - Seed value for the RNG
 * @returns Random number generator function
 */
export function createSeededRNG(seed: number): () => number {
  let state = seed;
  return () => {
    // LCG parameters from Numerical Recipes
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}
