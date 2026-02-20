/**
 * Scoring module unit tests
 *
 * Tests for the object-based calculateScore signature and edge cases:
 * - All blank
 * - All wrong
 * - Mixed
 * - Negative final score
 * - reward = 0
 * - penalty = 0
 * - Large numbers
 * - No implicit defaults allowed (must be explicit)
 */

import { describe, it, expect } from "vitest";
import {
  calculateScore,
  CalculateScoreParams,
  calculatePercentage,
  getScoreCategory,
} from "../scoring.js";

describe("calculateScore", () => {
  it("calculates basic score with correct and wrong answers", () => {
    const params: CalculateScoreParams = {
      correct: 5,
      wrong: 2,
      blank: 3,
      reward: 1,
      penalty: 0.25,
    };

    // 5 * 1 - 2 * 0.25 = 5 - 0.5 = 4.5
    expect(calculateScore(params)).toBe(4.5);
  });

  it("blank answers are neutral by default (blankPenalty = 0)", () => {
    const params: CalculateScoreParams = {
      correct: 5,
      wrong: 0,
      blank: 5,
      reward: 1,
      penalty: 0.25,
    };

    // 5 * 1 - 0 - 5 * 0 = 5
    expect(calculateScore(params)).toBe(5);
  });

  it("blankPenalty explicitly set affects score", () => {
    const params: CalculateScoreParams = {
      correct: 5,
      wrong: 0,
      blank: 5,
      reward: 1,
      penalty: 0.25,
      blankPenalty: 0.1,
    };

    // 5 * 1 - 0 - 5 * 0.1 = 5 - 0.5 = 4.5
    expect(calculateScore(params)).toBe(4.5);
  });

  it("handles all blank (reward = 0, penalty = 0, blankPenalty = 0)", () => {
    const params: CalculateScoreParams = {
      correct: 0,
      wrong: 0,
      blank: 10,
      reward: 1,
      penalty: 0.25,
      blankPenalty: 0,
    };

    expect(calculateScore(params)).toBe(0);
  });

  it("handles all wrong", () => {
    const params: CalculateScoreParams = {
      correct: 0,
      wrong: 10,
      blank: 0,
      reward: 1,
      penalty: 0.25,
    };

    // 0 - 10 * 0.25 = -2.5
    expect(calculateScore(params)).toBe(-2.5);
  });

  it("handles all correct", () => {
    const params: CalculateScoreParams = {
      correct: 10,
      wrong: 0,
      blank: 0,
      reward: 1,
      penalty: 0.25,
    };

    expect(calculateScore(params)).toBe(10);
  });

  it("handles mixed answers", () => {
    const params: CalculateScoreParams = {
      correct: 7,
      wrong: 2,
      blank: 1,
      reward: 1,
      penalty: 0.25,
      blankPenalty: 0.1,
    };

    // 7 * 1 - 2 * 0.25 - 1 * 0.1 = 7 - 0.5 - 0.1 = 6.4
    expect(calculateScore(params)).toBe(6.4);
  });

  it("score can go negative", () => {
    const params: CalculateScoreParams = {
      correct: 2,
      wrong: 10,
      blank: 0,
      reward: 1,
      penalty: 0.5,
    };

    // 2 * 1 - 10 * 0.5 = 2 - 5 = -3
    expect(calculateScore(params)).toBe(-3);
  });

  it("score is not clamped at zero", () => {
    const params: CalculateScoreParams = {
      correct: 0,
      wrong: 10,
      blank: 0,
      reward: 1,
      penalty: 1,
    };

    // Should be -10, not 0
    expect(calculateScore(params)).toBe(-10);
  });

  it("handles reward = 0", () => {
    const params: CalculateScoreParams = {
      correct: 10,
      wrong: 0,
      blank: 0,
      reward: 0,
      penalty: 0.25,
    };

    expect(calculateScore(params)).toBe(0);
  });

  it("handles penalty = 0", () => {
    const params: CalculateScoreParams = {
      correct: 5,
      wrong: 5,
      blank: 0,
      reward: 1,
      penalty: 0,
    };

    // 5 * 1 - 0 = 5
    expect(calculateScore(params)).toBe(5);
  });

  it("handles reward = 0 and penalty = 0", () => {
    const params: CalculateScoreParams = {
      correct: 5,
      wrong: 5,
      blank: 0,
      reward: 0,
      penalty: 0,
    };

    expect(calculateScore(params)).toBe(0);
  });

  it("handles large numbers", () => {
    const params: CalculateScoreParams = {
      correct: 10000,
      wrong: 5000,
      blank: 0,
      reward: 2,
      penalty: 0.5,
    };

    // 10000 * 2 - 5000 * 0.5 = 20000 - 2500 = 17500
    expect(calculateScore(params)).toBe(17500);
  });

  it("handles decimal precision correctly", () => {
    const params: CalculateScoreParams = {
      correct: 3,
      wrong: 3,
      blank: 3,
      reward: 0.333,
      penalty: 0.167,
      blankPenalty: 0.083,
    };

    // 3 * 0.333 - 3 * 0.167 - 3 * 0.083
    // = 0.999 - 0.501 - 0.249
    // = 0.249
    expect(calculateScore(params)).toBeCloseTo(0.249, 3);
  });

  it("handles all zeros", () => {
    const params: CalculateScoreParams = {
      correct: 0,
      wrong: 0,
      blank: 0,
      reward: 1,
      penalty: 0.25,
    };

    expect(calculateScore(params)).toBe(0);
  });

  it("is deterministic", () => {
    const params: CalculateScoreParams = {
      correct: 5,
      wrong: 2,
      blank: 3,
      reward: 1,
      penalty: 0.25,
    };

    const result1 = calculateScore(params);
    const result2 = calculateScore(params);

    expect(result1).toBe(result2);
  });

  it("does not mutate input params", () => {
    const params: CalculateScoreParams = {
      correct: 5,
      wrong: 2,
      blank: 3,
      reward: 1,
      penalty: 0.25,
    };

    const original = { ...params };
    calculateScore(params);

    expect(params).toEqual(original);
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
