/**
 * Insights Helpers — Unit Tests
 *
 * Tests the pure data transformation functions used by the Insights view.
 * DOM-free — all functions operate on plain data structures.
 */

import { describe, it, expect } from "vitest";
import type { CategoryMastery } from "../../../domain/types.js";
import type {
  InsightsQuestionData,
  InsightsDifficultyDistribution,
} from "../../../application/viewState.js";

import {
  sortCategoryMasteryByWeakness,
  countQuestionsPerCategory,
  getWeakQuestionsSorted,
  filterByCategory,
  getTrapQuestions,
  computeDifficultyPercentages,
  truncateText,
} from "../insights/insightsHelpers.js";

// ============================================================================
// Factories
// ============================================================================

function makeMastery(
  category: string,
  weaknessScore: number,
  accuracy: number,
  level: "weak" | "learning" | "mastered" = "learning",
): CategoryMastery {
  return { category, weaknessScore, accuracy, level };
}

function makeQuestion(
  overrides: Partial<InsightsQuestionData> = {},
): InsightsQuestionData {
  return {
    examId: "exam-1",
    examTitle: "Test Exam",
    questionNumber: 1,
    questionText: "Default question text",
    categories: ["General"],
    referenceArticle: "Art. 1",
    weaknessScore: 0,
    difficultyLevel: "easy",
    difficultyScore: 0,
    trapLevel: "none",
    trapScore: 0,
    answers: [
      { letter: "A", text: "Answer A", isCorrect: true },
      { letter: "B", text: "Answer B", isCorrect: false },
    ],
    feedback: {
      literalCitation: "Citation text",
      explanation: "Explanation text",
    },
    ...overrides,
  };
}

// ============================================================================
// sortCategoryMasteryByWeakness
// ============================================================================

describe("sortCategoryMasteryByWeakness", () => {
  it("sorts categories by weakness descending (weakest first)", () => {
    const input: CategoryMastery[] = [
      makeMastery("A", 1.0, 0.7),
      makeMastery("B", 3.5, 0.3),
      makeMastery("C", 2.0, 0.5),
    ];

    const result = sortCategoryMasteryByWeakness(input);

    expect(result.map((c) => c.category)).toEqual(["B", "C", "A"]);
  });

  it("breaks ties by accuracy ascending", () => {
    const input: CategoryMastery[] = [
      makeMastery("A", 2.0, 0.8),
      makeMastery("B", 2.0, 0.4),
    ];

    const result = sortCategoryMasteryByWeakness(input);

    expect(result.map((c) => c.category)).toEqual(["B", "A"]);
  });

  it("does not mutate input array", () => {
    const input: CategoryMastery[] = [
      makeMastery("A", 1.0, 0.5),
      makeMastery("B", 3.0, 0.3),
    ];

    const original = [...input];
    sortCategoryMasteryByWeakness(input);

    expect(input).toEqual(original);
  });

  it("returns empty array for empty input", () => {
    expect(sortCategoryMasteryByWeakness([])).toEqual([]);
  });
});

// ============================================================================
// countQuestionsPerCategory
// ============================================================================

describe("countQuestionsPerCategory", () => {
  it("counts questions per category", () => {
    const questions = [
      makeQuestion({ categories: ["A", "B"] }),
      makeQuestion({ categories: ["A"] }),
      makeQuestion({ categories: ["B", "C"] }),
    ];

    const counts = countQuestionsPerCategory(questions);

    expect(counts.get("A")).toBe(2);
    expect(counts.get("B")).toBe(2);
    expect(counts.get("C")).toBe(1);
  });

  it("returns empty map for empty input", () => {
    expect(countQuestionsPerCategory([]).size).toBe(0);
  });
});

// ============================================================================
// getWeakQuestionsSorted
// ============================================================================

describe("getWeakQuestionsSorted", () => {
  it("filters to weakness > 0 and sorts descending", () => {
    const questions = [
      makeQuestion({ questionNumber: 1, weaknessScore: 0 }),
      makeQuestion({ questionNumber: 2, weaknessScore: 5.5 }),
      makeQuestion({ questionNumber: 3, weaknessScore: 2.1 }),
      makeQuestion({ questionNumber: 4, weaknessScore: 8.0 }),
    ];

    const result = getWeakQuestionsSorted(questions);

    expect(result.map((q) => q.questionNumber)).toEqual([4, 2, 3]);
  });

  it("excludes questions with zero weakness", () => {
    const questions = [
      makeQuestion({ weaknessScore: 0 }),
      makeQuestion({ weaknessScore: 0 }),
    ];

    expect(getWeakQuestionsSorted(questions)).toHaveLength(0);
  });

  it("does not mutate input", () => {
    const questions = [
      makeQuestion({ questionNumber: 1, weaknessScore: 3 }),
      makeQuestion({ questionNumber: 2, weaknessScore: 1 }),
    ];

    const original = [...questions];
    getWeakQuestionsSorted(questions);

    expect(questions).toEqual(original);
  });
});

// ============================================================================
// filterByCategory
// ============================================================================

describe("filterByCategory", () => {
  it("filters questions to those containing the category", () => {
    const questions = [
      makeQuestion({ questionNumber: 1, categories: ["A", "B"] }),
      makeQuestion({ questionNumber: 2, categories: ["B"] }),
      makeQuestion({ questionNumber: 3, categories: ["C"] }),
    ];

    const result = filterByCategory(questions, "B");

    expect(result.map((q) => q.questionNumber)).toEqual([1, 2]);
  });

  it("returns empty for non-existent category", () => {
    const questions = [makeQuestion({ categories: ["A"] })];
    expect(filterByCategory(questions, "Z")).toHaveLength(0);
  });
});

// ============================================================================
// getTrapQuestions
// ============================================================================

describe("getTrapQuestions", () => {
  it("returns only trap questions sorted by score descending", () => {
    const questions = [
      makeQuestion({ questionNumber: 1, trapLevel: "none", trapScore: 0 }),
      makeQuestion({
        questionNumber: 2,
        trapLevel: "possible",
        trapScore: 0.4,
      }),
      makeQuestion({
        questionNumber: 3,
        trapLevel: "confirmed",
        trapScore: 0.8,
      }),
      makeQuestion({ questionNumber: 4, trapLevel: "none", trapScore: 0 }),
    ];

    const result = getTrapQuestions(questions);

    expect(result).toHaveLength(2);
    expect(result[0].questionNumber).toBe(3); // confirmed, higher score
    expect(result[1].questionNumber).toBe(2); // possible, lower score
  });

  it("returns empty if no trap questions exist", () => {
    const questions = [
      makeQuestion({ trapLevel: "none" }),
      makeQuestion({ trapLevel: "none" }),
    ];

    expect(getTrapQuestions(questions)).toHaveLength(0);
  });
});

// ============================================================================
// computeDifficultyPercentages
// ============================================================================

describe("computeDifficultyPercentages", () => {
  it("computes correct percentages", () => {
    const dist: InsightsDifficultyDistribution = {
      easy: 42,
      medium: 50,
      hard: 8,
      total: 100,
    };

    const pct = computeDifficultyPercentages(dist);

    expect(pct.easy).toBe(42);
    expect(pct.medium).toBe(50);
    expect(pct.hard).toBe(8);
  });

  it("handles rounding", () => {
    const dist: InsightsDifficultyDistribution = {
      easy: 1,
      medium: 1,
      hard: 1,
      total: 3,
    };

    const pct = computeDifficultyPercentages(dist);

    expect(pct.easy).toBe(33);
    expect(pct.medium).toBe(33);
    expect(pct.hard).toBe(33);
  });

  it("returns all zeros when total is 0", () => {
    const dist: InsightsDifficultyDistribution = {
      easy: 0,
      medium: 0,
      hard: 0,
      total: 0,
    };

    const pct = computeDifficultyPercentages(dist);

    expect(pct.easy).toBe(0);
    expect(pct.medium).toBe(0);
    expect(pct.hard).toBe(0);
  });

  it("works with skewed distribution", () => {
    const dist: InsightsDifficultyDistribution = {
      easy: 90,
      medium: 10,
      hard: 0,
      total: 100,
    };

    const pct = computeDifficultyPercentages(dist);

    expect(pct.easy).toBe(90);
    expect(pct.medium).toBe(10);
    expect(pct.hard).toBe(0);
  });
});

// ============================================================================
// truncateText
// ============================================================================

describe("truncateText", () => {
  it("returns text unchanged when shorter than max", () => {
    expect(truncateText("Hello", 10)).toBe("Hello");
  });

  it("truncates and adds ellipsis when over max", () => {
    const result = truncateText("This is a long text that needs truncation", 20);
    expect(result.length).toBeLessThanOrEqual(21); // 20 + ellipsis char
    expect(result.endsWith("…")).toBe(true);
  });

  it("respects custom maxLength", () => {
    const result = truncateText("ABCDEFGHIJ", 5);
    expect(result).toBe("ABCDE…");
  });

  it("uses default maxLength of 80", () => {
    const longText = "A".repeat(100);
    const result = truncateText(longText);
    expect(result.length).toBeLessThanOrEqual(81);
  });

  it("handles exact length", () => {
    expect(truncateText("12345", 5)).toBe("12345");
  });
});
