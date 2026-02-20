/**
 * Seeded Random Number Generator - Test-Only Utility
 *
 * ⚠️ TEST-ONLY: This module is for unit testing purposes ONLY.
 * Do NOT use in production code.
 *
 * Provides deterministic random number generation for reproducible tests.
 * Uses a simple LCG (Linear Congruential Generator) algorithm.
 */

/**
 * Create a seeded random number generator for reproducible testing.
 * Uses a simple LCG (Linear Congruential Generator) algorithm.
 *
 * @param seed - Seed value for the RNG
 * @returns Random number generator function that produces values [0, 1)
 */
export function createSeededRNG(seed: number): () => number {
  let state = seed;
  return () => {
    // LCG parameters from Numerical Recipes
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}
