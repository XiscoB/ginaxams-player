/**
 * Seeded Random Number Generator — Pure Domain Utility (Phase 5)
 *
 * Provides deterministic pseudo-random number generation for production use.
 * Uses the same LCG algorithm as the test-utils version but intended for
 * use in domain logic (e.g., adaptive review question selection).
 *
 * Rules:
 * - Pure factory functions (no global state)
 * - Deterministic: same seed → same sequence
 * - No external dependencies
 */

/**
 * Create a seeded random number generator using a Linear Congruential Generator.
 *
 * The returned function produces deterministic values in [0, 1) when called
 * repeatedly. The sequence is fully determined by the initial seed.
 *
 * @param seed - Numeric seed value
 * @returns Function that returns the next pseudo-random number in [0, 1)
 */
export function createSeededRNG(seed: number): () => number {
  let state = seed;
  return () => {
    // LCG parameters from Numerical Recipes
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/**
 * Convert a string (e.g., UUID attempt ID) to a deterministic numeric seed.
 *
 * Uses the djb2 hash algorithm for fast, well-distributed hashing.
 * The result is always a non-negative 32-bit integer.
 *
 * @param str - Input string to hash
 * @returns Non-negative integer suitable as an RNG seed
 */
export function hashStringToSeed(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    // hash * 33 + charCode
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  // Ensure non-negative via unsigned right shift
  return hash >>> 0;
}
