/**
 * Distribution module unit tests
 *
 * Tests for:
 * - Weight normalization
 * - Negative weight error
 * - Zero total error
 * - Allocation exact sum
 * - Edge rounding case
 * - sampleSize === items.length
 * - sampleSize === 0
 * - Deterministic RNG injection
 * - Throw when sampleSize > items.length
 */

import { describe, it, expect } from "vitest";
import {
  normalizeWeights,
  allocateQuestionCounts,
  randomSampleWithoutReplacement,
} from "../distribution.js";
import { createSeededRNG } from "../../test-utils/seededRng.js";

describe("normalizeWeights", () => {
  it("normalizes weights to sum to 1", () => {
    const weights = { exam1: 2, exam2: 2 };
    const result = normalizeWeights(weights);

    expect(result.exam1).toBe(0.5);
    expect(result.exam2).toBe(0.5);
    expect(result.exam1 + result.exam2).toBe(1);
  });

  it("handles uneven weights", () => {
    const weights = { exam1: 3, exam2: 1 };
    const result = normalizeWeights(weights);

    expect(result.exam1).toBe(0.75);
    expect(result.exam2).toBe(0.25);
    expect(result.exam1 + result.exam2).toBe(1);
  });

  it("handles single weight", () => {
    const weights = { exam1: 5 };
    const result = normalizeWeights(weights);

    expect(result.exam1).toBe(1);
  });

  it("preserves key structure", () => {
    const weights = { a: 1, b: 2, c: 3 };
    const result = normalizeWeights(weights);

    expect(Object.keys(result)).toContain("a");
    expect(Object.keys(result)).toContain("b");
    expect(Object.keys(result)).toContain("c");
  });

  it("does not mutate input", () => {
    const weights = { exam1: 2, exam2: 2 };
    const original = { ...weights };
    normalizeWeights(weights);

    expect(weights).toEqual(original);
  });

  it("returns empty object for empty weights", () => {
    const result = normalizeWeights({});
    expect(result).toEqual({});
  });
});

describe("normalizeWeights - error cases", () => {
  it("throws on negative weight", () => {
    const weights = { exam1: 2, exam2: -1 };

    expect(() => normalizeWeights(weights)).toThrow("Negative weight not allowed");
  });

  it("throws on zero total weight", () => {
    const weights = { exam1: 0, exam2: 0 };

    expect(() => normalizeWeights(weights)).toThrow("Total weight cannot be zero");
  });

  it("throws when all weights are zero", () => {
    const weights = { exam1: 0 };

    expect(() => normalizeWeights(weights)).toThrow("Total weight cannot be zero");
  });
});

describe("allocateQuestionCounts", () => {
  it("allocates exact sum equal to totalQuestions", () => {
    const normalizedWeights = { exam1: 0.5, exam2: 0.5 };
    const result = allocateQuestionCounts({
      normalizedWeights,
      totalQuestions: 10,
    });

    const total = Object.values(result).reduce((sum, count) => sum + count, 0);
    expect(total).toBe(10);
  });

  it("allocates proportionally to weights", () => {
    const normalizedWeights = { exam1: 0.75, exam2: 0.25 };
    const result = allocateQuestionCounts({
      normalizedWeights,
      totalQuestions: 100,
    });

    expect(result.exam1).toBe(75);
    expect(result.exam2).toBe(25);
  });

  it("handles rounding with largest remainder method", () => {
    // 10 questions, 3 exams with equal weights
    // Exact allocation: 3.33... each
    // Floor: 3 each = 9 assigned
    // Remainder: 1 to distribute to largest fraction (all equal, first gets it)
    const normalizedWeights = { exam1: 1 / 3, exam2: 1 / 3, exam3: 1 / 3 };
    const result = allocateQuestionCounts({
      normalizedWeights,
      totalQuestions: 10,
    });

    const total = Object.values(result).reduce((sum, count) => sum + count, 0);
    expect(total).toBe(10);

    // With equal weights, should be 3, 3, 4 or some permutation
    const counts = Object.values(result);
    expect(counts.sort()).toEqual([3, 3, 4]);
  });

  it("handles edge rounding case: 7 questions across 3 exams", () => {
    // 7 / 3 = 2.33 each
    // Exact: 2.33, 2.33, 2.33
    // Floor: 2, 2, 2 = 6 assigned
    // Remainder: 1 to distribute
    const normalizedWeights = { exam1: 1 / 3, exam2: 1 / 3, exam3: 1 / 3 };
    const result = allocateQuestionCounts({
      normalizedWeights,
      totalQuestions: 7,
    });

    const total = Object.values(result).reduce((sum, count) => sum + count, 0);
    expect(total).toBe(7);

    const counts = Object.values(result);
    expect(counts.sort()).toEqual([2, 2, 3]);
  });

  it("uses deterministic tie-breaking (earlier input wins on equal remainders)", () => {
    // Create scenario where remainders are equal
    // 5 questions, 2 exams with equal 50/50 weights
    // Exact: 2.5, 2.5
    // Floor: 2, 2 = 4 assigned
    // Remainder: 1 to distribute
    // Both have fraction = 0.5, so earlier exam (exam1) should get the extra question
    const normalizedWeights = { exam1: 0.5, exam2: 0.5 };
    const result = allocateQuestionCounts({
      normalizedWeights,
      totalQuestions: 5,
    });

    expect(result.exam1).toBe(3); // Earlier input gets priority
    expect(result.exam2).toBe(2);
  });

  it("handles single exam", () => {
    const normalizedWeights = { exam1: 1 };
    const result = allocateQuestionCounts({
      normalizedWeights,
      totalQuestions: 50,
    });

    expect(result.exam1).toBe(50);
  });

  it("returns empty object for empty weights", () => {
    const result = allocateQuestionCounts({
      normalizedWeights: {},
      totalQuestions: 10,
    });

    expect(result).toEqual({});
  });

  it("does not mutate input weights", () => {
    const normalizedWeights = { exam1: 0.5, exam2: 0.5 };
    const original = { ...normalizedWeights };

    allocateQuestionCounts({
      normalizedWeights,
      totalQuestions: 10,
    });

    expect(normalizedWeights).toEqual(original);
  });
});

describe("allocateQuestionCounts - error cases", () => {
  it("throws when totalQuestions is zero", () => {
    const normalizedWeights = { exam1: 1 };

    expect(() =>
      allocateQuestionCounts({
        normalizedWeights,
        totalQuestions: 0,
      })
    ).toThrow("totalQuestions must be positive");
  });

  it("throws when totalQuestions is negative", () => {
    const normalizedWeights = { exam1: 1 };

    expect(() =>
      allocateQuestionCounts({
        normalizedWeights,
        totalQuestions: -5,
      })
    ).toThrow("totalQuestions must be positive");
  });
});

describe("randomSampleWithoutReplacement", () => {
  it("returns correct sample size", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = randomSampleWithoutReplacement({
      items,
      sampleSize: 5,
    });

    expect(result.length).toBe(5);
  });

  it("returns unique items (no duplicates)", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = randomSampleWithoutReplacement({
      items,
      sampleSize: 5,
    });

    const unique = new Set(result);
    expect(unique.size).toBe(result.length);
  });

  it("only returns items from original array", () => {
    const items = [1, 2, 3, 4, 5];
    const result = randomSampleWithoutReplacement({
      items,
      sampleSize: 3,
    });

    for (const item of result) {
      expect(items).toContain(item);
    }
  });

  it("returns all items when sampleSize equals items.length", () => {
    const items = [1, 2, 3, 4, 5];
    const result = randomSampleWithoutReplacement({
      items,
      sampleSize: 5,
    });

    // Should contain all items (order may differ)
    expect(result.sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("returns empty array when sampleSize is 0", () => {
    const items = [1, 2, 3, 4, 5];
    const result = randomSampleWithoutReplacement({
      items,
      sampleSize: 0,
    });

    expect(result).toEqual([]);
  });

  it("does not mutate original array", () => {
    const items = [1, 2, 3, 4, 5];
    const original = [...items];

    randomSampleWithoutReplacement({
      items,
      sampleSize: 3,
    });

    expect(items).toEqual(original);
  });

  it("is deterministic when RNG is injected", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const rng = createSeededRNG(12345);

    const result1 = randomSampleWithoutReplacement({
      items,
      sampleSize: 5,
      rng,
    });

    const rng2 = createSeededRNG(12345);
    const result2 = randomSampleWithoutReplacement({
      items,
      sampleSize: 5,
      rng: rng2,
    });

    expect(result1).toEqual(result2);
  });

  it("produces different results with different seeds", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    const result1 = randomSampleWithoutReplacement({
      items,
      sampleSize: 5,
      rng: createSeededRNG(12345),
    });

    const result2 = randomSampleWithoutReplacement({
      items,
      sampleSize: 5,
      rng: createSeededRNG(54321),
    });

    expect(result1).not.toEqual(result2);
  });

  it("handles empty items array with sampleSize 0", () => {
    const result = randomSampleWithoutReplacement({
      items: [],
      sampleSize: 0,
    });

    expect(result).toEqual([]);
  });
});

describe("randomSampleWithoutReplacement - error cases", () => {
  it("throws when sampleSize exceeds items.length", () => {
    const items = [1, 2, 3];

    expect(() =>
      randomSampleWithoutReplacement({
        items,
        sampleSize: 5,
      })
    ).toThrow("sampleSize (5) cannot exceed items.length (3)");
  });

  it("throws when sampleSize is negative", () => {
    const items = [1, 2, 3];

    expect(() =>
      randomSampleWithoutReplacement({
        items,
        sampleSize: -1,
      })
    ).toThrow("sampleSize cannot be negative");
  });
});

describe("createSeededRNG", () => {
  it("produces deterministic sequence", () => {
    const rng1 = createSeededRNG(12345);
    const rng2 = createSeededRNG(12345);

    const values1 = [rng1(), rng1(), rng1(), rng1(), rng1()];
    const values2 = [rng2(), rng2(), rng2(), rng2(), rng2()];

    expect(values1).toEqual(values2);
  });

  it("produces values between 0 and 1", () => {
    const rng = createSeededRNG(12345);

    for (let i = 0; i < 100; i++) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("produces different sequences with different seeds", () => {
    const rng1 = createSeededRNG(12345);
    const rng2 = createSeededRNG(54321);

    const values1 = [rng1(), rng1(), rng1()];
    const values2 = [rng2(), rng2(), rng2()];

    expect(values1).not.toEqual(values2);
  });
});
