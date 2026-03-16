/**
 * Distribution Module - Pure functions for weighted question selection
 *
 * This module contains ONLY pure deterministic domain logic.
 * No IndexedDB. No DOM. No randomness without injection control. No hidden state.
 *
 * All functions are deterministic, testable, and have no side effects.
 */

// ============================================================================
// Types
// ============================================================================

export interface AllocateQuestionCountsParams {
  normalizedWeights: Record<string, number>;
  totalQuestions: number;
}

export interface AllocationResult {
  examId: string;
  allocation: number;
  fraction: number;
  /**
   * Original index in the input array.
   * Used for deterministic tie-breaking when fractions are equal.
   */
  originalIndex: number;
}

export interface RandomSampleParams<T> {
  items: readonly T[];
  sampleSize: number;
  rng?: () => number;
}

// ============================================================================
// Weight Normalization
// ============================================================================

/**
 * Normalize exam weights so total = 1.
 *
 * Rules:
 * - Negative weights → throw
 * - Zero total → throw
 * - Preserve key structure
 * - Deterministic
 * - No mutation
 *
 * @param weights - Record of exam IDs to their weights
 * @returns Normalized weights that sum to 1.0
 * @throws Error if any weight is negative or if total is zero
 */
export function normalizeWeights(
  weights: Record<string, number>
): Record<string, number> {
  // Check for negative weights
  for (const [key, weight] of Object.entries(weights)) {
    if (weight < 0) {
      throw new Error(`Negative weight not allowed: ${key} = ${weight}`);
    }
  }

  const keys = Object.keys(weights);

  // Handle empty weights
  if (keys.length === 0) {
    return {};
  }

  // Calculate total weight
  const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);

  // Zero total check
  if (totalWeight === 0) {
    throw new Error("Total weight cannot be zero");
  }

  // Normalize without mutating input
  const normalized: Record<string, number> = {};
  for (const key of keys) {
    normalized[key] = weights[key] / totalWeight;
  }

  return normalized;
}

// ============================================================================
// Question Count Allocation (Largest Remainder Method - Hamilton Method)
// ============================================================================

/**
 * Allocate integer question counts per exam using proportional distribution.
 *
 * Uses the Largest Remainder Method (Hamilton method) to ensure exact sum.
 *
 * TIE-BREAKING STRATEGY:
 * When two exams have identical remainder values, the exam that appeared
 * EARLIER in the input (lower originalIndex) receives priority.
 * This guarantees deterministic output regardless of JS engine.
 *
 * Constraints:
 * - Sum must equal totalQuestions
 * - Deterministic rounding strategy (Largest Remainder Method)
 * - Stable tie-breaking (earlier input order wins)
 * - No mutation
 * - Throw if totalQuestions <= 0
 *
 * @param params - Object containing normalizedWeights and totalQuestions
 * @returns Record mapping exam IDs to question counts
 * @throws Error if totalQuestions <= 0
 */
export function allocateQuestionCounts(
  params: AllocateQuestionCountsParams
): Record<string, number> {
  const { normalizedWeights, totalQuestions } = params;

  if (totalQuestions <= 0) {
    throw new Error("totalQuestions must be positive");
  }

  const examIds = Object.keys(normalizedWeights);

  // Handle empty weights
  if (examIds.length === 0) {
    return {};
  }

  // Calculate initial floor allocations and remainders
  const allocations: AllocationResult[] = [];
  let assigned = 0;

  for (let i = 0; i < examIds.length; i++) {
    const examId = examIds[i];
    const weight = normalizedWeights[examId];
    const exact = totalQuestions * weight;
    const floor = Math.floor(exact);
    const fraction = exact - floor;

    allocations.push({
      examId,
      allocation: floor,
      fraction,
      originalIndex: i,
    });
    assigned += floor;
  }

  // Distribute remaining questions by largest remainder (Hamilton method)
  const remaining = totalQuestions - assigned;

  // Sort by:
  // 1. fraction descending (largest remainder first)
  // 2. originalIndex ascending (earlier input wins ties)
  const sortedIndices = allocations
    .map((_, index) => index)
    .sort((a, b) => {
      const fracDiff = allocations[b].fraction - allocations[a].fraction;
      if (fracDiff !== 0) return fracDiff;
      // Tie-breaker: lower originalIndex (appeared earlier) wins
      return allocations[a].originalIndex - allocations[b].originalIndex;
    });

  // Add one to the top 'remaining' exams
  for (let i = 0; i < remaining; i++) {
    if (i < sortedIndices.length) {
      allocations[sortedIndices[i]].allocation += 1;
    }
  }

  // Build final distribution record
  const distribution: Record<string, number> = {};
  for (const { examId, allocation } of allocations) {
    distribution[examId] = allocation;
  }

  return distribution;
}

// ============================================================================
// Random Sampling (Deterministic with Optional RNG Injection)
// ============================================================================

/**
 * Random sample without replacement using in-place Fisher-Yates selection.
 *
 * IMPLEMENTATION DETAILS:
 * - Uses partial Fisher-Yates shuffle for O(sampleSize) complexity
 * - Creates a copy of the input array (pool) to avoid mutation
 * - Does NOT allocate a full clone when sampleSize === items.length
 *   (uses shuffleArray instead, which also creates a copy)
 * - Memory: O(items.length) for the pool copy
 *
 * Rules:
 * - No duplicates
 * - sampleSize > items.length → throw
 * - Deterministic if rng injected
 * - Default rng = Math.random
 * - Must not mutate original array
 *
 * Complexity:
 * - Time: O(sampleSize) for the sampling loop
 * - Space: O(items.length) for the pool copy
 *
 * @param params - Object containing items, sampleSize, and optional rng
 * @returns New array with sampled items (shuffled order)
 * @throws Error if sampleSize > items.length or sampleSize < 0
 */
export function randomSampleWithoutReplacement<T>(
  params: RandomSampleParams<T>
): T[] {
  const { items, sampleSize, rng = Math.random } = params;

  if (sampleSize < 0) {
    throw new Error("sampleSize cannot be negative");
  }

  if (sampleSize > items.length) {
    throw new Error(
      `sampleSize (${sampleSize}) cannot exceed items.length (${items.length})`
    );
  }

  // Handle edge cases
  if (sampleSize === 0) {
    return [];
  }

  if (sampleSize === items.length) {
    // Return a shuffled copy of all items
    return shuffleArray(items, rng);
  }

  // Create a copy to avoid mutating original
  const pool = [...items];
  const result: T[] = [];

  // Fisher-Yates sampling without replacement
  // Complexity: O(sampleSize)
  for (let i = 0; i < sampleSize; i++) {
    const remaining = pool.length - i;
    const j = i + Math.floor(rng() * remaining);

    // Swap pool[i] and pool[j]
    [pool[i], pool[j]] = [pool[j], pool[i]];

    // pool[i] is now our selected item
    result.push(pool[i]);
  }

  return result;
}

/**
 * Deterministic array shuffle using Fisher-Yates algorithm.
 * Creates a new array without mutating the original.
 *
 * Complexity:
 * - Time: O(n) where n = array.length
 * - Space: O(n) for the result copy
 *
 * @param array - Array to shuffle
 * @param rng - Optional random number generator (defaults to Math.random)
 * @returns New shuffled array
 */
function shuffleArray<T>(array: readonly T[], rng: () => number = Math.random): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}


