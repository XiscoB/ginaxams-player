/**
 * Scoring module unit tests
 */

import { describe, it, expect } from "vitest";
import {
  calculateScore,
  calculatePercentage,
  getScoreCategory,
  normalizeWeights,
  distributeQuestions,
  shuffleArray,
  createSeededRNG,
} from "../domain/scoring.js";

describe("calculateScore", () => {
  it("calculates score with default weights", () => {
    expect(calculateScore(5, 2, 1)).toBe(5);
    expect(calculateScore(10, 0, 0)).toBe(10);
    expect(calculateScore(0, 5, 5)).toBe(0);
  });

  it("calculates score with custom reward and penalty", () => {
    expect(calculateScore(5, 2, 1, 2, 0.5)).toBe(9); // 5*2 - 2*0.5 = 10 - 1 = 9
    expect(calculateScore(3, 1, 0, 3, 1)).toBe(8); // 3*3 - 1*1 = 9 - 1 = 8
  });

  it("handles all zeros", () => {
    expect(calculateScore(0, 0, 0)).toBe(0);
  });
});

describe("calculatePercentage", () => {
  it("calculates percentage correctly", () => {
    expect(calculatePercentage(5, 10)).toBe(50);
    expect(calculatePercentage(7, 10)).toBe(70);
    expect(calculatePercentage(0, 10)).toBe(0);
    expect(calculatePercentage(10, 10)).toBe(100);
  });

  it("returns 0 for total of 0", () => {
    expect(calculatePercentage(5, 0)).toBe(0);
    expect(calculatePercentage(0, 0)).toBe(0);
  });

  it("rounds to nearest integer", () => {
    expect(calculatePercentage(1, 3)).toBe(33);
    expect(calculatePercentage(2, 3)).toBe(67);
  });
});

describe("getScoreCategory", () => {
  it("returns 'good' for 70% and above", () => {
    expect(getScoreCategory(70)).toBe("good");
    expect(getScoreCategory(100)).toBe("good");
    expect(getScoreCategory(85)).toBe("good");
  });

  it("returns 'medium' for 50-69%", () => {
    expect(getScoreCategory(50)).toBe("medium");
    expect(getScoreCategory(69)).toBe("medium");
    expect(getScoreCategory(60)).toBe("medium");
  });

  it("returns 'bad' for below 50%", () => {
    expect(getScoreCategory(49)).toBe("bad");
    expect(getScoreCategory(0)).toBe("bad");
    expect(getScoreCategory(25)).toBe("bad");
  });
});

describe("normalizeWeights", () => {
  it("returns equal weights when no weights provided", () => {
    const result = normalizeWeights(["exam1", "exam2", "exam3"]);
    expect(result["exam1"]).toBeCloseTo(0.333, 2);
    expect(result["exam2"]).toBeCloseTo(0.333, 2);
    expect(result["exam3"]).toBeCloseTo(0.333, 2);
  });

  it("normalizes provided weights to sum to 1", () => {
    const result = normalizeWeights(["exam1", "exam2"], { exam1: 2, exam2: 2 });
    expect(result["exam1"]).toBe(0.5);
    expect(result["exam2"]).toBe(0.5);
  });

  it("handles uneven weights", () => {
    const result = normalizeWeights(["exam1", "exam2"], { exam1: 3, exam2: 1 });
    expect(result["exam1"]).toBe(0.75);
    expect(result["exam2"]).toBe(0.25);
  });

  it("returns empty object for empty exam list", () => {
    expect(normalizeWeights([])).toEqual({});
  });

  it("defaults to weight of 1 for exams not in weights", () => {
    const result = normalizeWeights(["exam1", "exam2"], { exam1: 2 });
    // exam1=2, exam2=1, total=3
    expect(result["exam1"]).toBeCloseTo(0.667, 2);
    expect(result["exam2"]).toBeCloseTo(0.333, 2);
  });
});

describe("distributeQuestions", () => {
  it("distributes questions evenly with equal weights", () => {
    const result = distributeQuestions(10, ["exam1", "exam2"]);
    expect(result["exam1"] + result["exam2"]).toBe(10);
    expect(result["exam1"]).toBe(5);
    expect(result["exam2"]).toBe(5);
  });

  it("distributes according to weights", () => {
    const result = distributeQuestions(10, ["exam1", "exam2"], { exam1: 3, exam2: 1 });
    expect(result["exam1"] + result["exam2"]).toBe(10);
    expect(result["exam1"]).toBe(8); // 75% of 10, rounded with largest remainder
    expect(result["exam2"]).toBe(2); // 25% of 10, rounded with largest remainder
  });

  it("handles remainder distribution", () => {
    const result = distributeQuestions(10, ["exam1", "exam2", "exam3"]);
    // 10 / 3 = 3.33 each, should distribute as 3, 3, 4 or similar
    expect(result["exam1"] + result["exam2"] + result["exam3"]).toBe(10);
  });

  it("returns empty object for zero questions", () => {
    expect(distributeQuestions(0, ["exam1"])).toEqual({});
  });

  it("returns empty object for empty exam list", () => {
    expect(distributeQuestions(10, [])).toEqual({});
  });
});

describe("shuffleArray", () => {
  it("returns a new array without mutating original", () => {
    const original = [1, 2, 3, 4, 5];
    const shuffled = shuffleArray(original);
    expect(shuffled).not.toBe(original);
    expect(original).toEqual([1, 2, 3, 4, 5]);
  });

  it("contains same elements after shuffle", () => {
    const original = [1, 2, 3, 4, 5];
    const shuffled = shuffleArray(original);
    expect(shuffled.sort()).toEqual(original.sort());
  });

  it("handles empty array", () => {
    expect(shuffleArray([])).toEqual([]);
  });

  it("handles single element", () => {
    expect(shuffleArray([1])).toEqual([1]);
  });

  it("is deterministic with seeded RNG", () => {
    const rng = createSeededRNG(12345);
    const result1 = shuffleArray([1, 2, 3, 4, 5], rng);
    
    const rng2 = createSeededRNG(12345);
    const result2 = shuffleArray([1, 2, 3, 4, 5], rng2);
    
    expect(result1).toEqual(result2);
  });
});

describe("createSeededRNG", () => {
  it("produces deterministic sequence", () => {
    const rng = createSeededRNG(12345);
    const values1 = [rng(), rng(), rng(), rng(), rng()];
    
    const rng2 = createSeededRNG(12345);
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
