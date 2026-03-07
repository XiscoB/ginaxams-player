/**
 * Telemetry Helpers — Unit Tests
 *
 * Tests for all pure helper functions in telemetryHelpers.ts.
 * DOM-free, uses Vitest.
 */

import { describe, it, expect } from "vitest";
import type { TelemetryQuestionData } from "../../../application/viewState.js";
import {
  sortByWrongCount,
  sortByResponseTime,
  sortByMostSeen,
  sortByLeastSeen,
  sortByRecentlySeen,
  sortQuestions,
  filterUnseenQuestions,
  filterSeenQuestions,
  filterByCategory,
  groupTelemetryByCategory,
  computeUnseenByCategory,
  computeStability,
  formatResponseTime,
  getTopFailedQuestions,
  getTopSlowestQuestions,
} from "../telemetry/telemetryHelpers.js";

// ============================================================================
// Test Fixtures
// ============================================================================

function makeQuestion(
  overrides: Partial<TelemetryQuestionData> = {},
): TelemetryQuestionData {
  return {
    examId: "exam-1",
    examTitle: "Test Exam",
    questionNumber: 1,
    questionText: "Sample question?",
    categories: ["General"],
    timesCorrect: 0,
    timesWrong: 0,
    timesBlank: 0,
    consecutiveCorrect: 0,
    avgResponseTimeMs: 0,
    totalSeen: 0,
    lastSeenAt: "",
    ...overrides,
  };
}

// ============================================================================
// sortByWrongCount
// ============================================================================

describe("sortByWrongCount", () => {
  it("sorts by timesWrong descending", () => {
    const questions = [
      makeQuestion({ questionNumber: 1, timesWrong: 2 }),
      makeQuestion({ questionNumber: 2, timesWrong: 7 }),
      makeQuestion({ questionNumber: 3, timesWrong: 4 }),
    ];

    const sorted = sortByWrongCount(questions);
    expect(sorted.map((q) => q.questionNumber)).toEqual([2, 3, 1]);
  });

  it("breaks ties by totalSeen descending", () => {
    const questions = [
      makeQuestion({ questionNumber: 1, timesWrong: 3, totalSeen: 5 }),
      makeQuestion({ questionNumber: 2, timesWrong: 3, totalSeen: 10 }),
    ];

    const sorted = sortByWrongCount(questions);
    expect(sorted.map((q) => q.questionNumber)).toEqual([2, 1]);
  });

  it("does not mutate input", () => {
    const questions = [
      makeQuestion({ questionNumber: 1, timesWrong: 5 }),
      makeQuestion({ questionNumber: 2, timesWrong: 1 }),
    ];
    const original = [...questions];
    sortByWrongCount(questions);
    expect(questions).toEqual(original);
  });

  it("returns empty array for empty input", () => {
    expect(sortByWrongCount([])).toEqual([]);
  });
});

// ============================================================================
// sortByResponseTime
// ============================================================================

describe("sortByResponseTime", () => {
  it("sorts by avgResponseTimeMs descending", () => {
    const questions = [
      makeQuestion({
        questionNumber: 1,
        avgResponseTimeMs: 5000,
        totalSeen: 1,
      }),
      makeQuestion({
        questionNumber: 2,
        avgResponseTimeMs: 18000,
        totalSeen: 3,
      }),
      makeQuestion({
        questionNumber: 3,
        avgResponseTimeMs: 9200,
        totalSeen: 2,
      }),
    ];

    const sorted = sortByResponseTime(questions);
    expect(sorted.map((q) => q.questionNumber)).toEqual([2, 3, 1]);
  });

  it("excludes unseen questions", () => {
    const questions = [
      makeQuestion({
        questionNumber: 1,
        avgResponseTimeMs: 5000,
        totalSeen: 1,
      }),
      makeQuestion({ questionNumber: 2, avgResponseTimeMs: 0, totalSeen: 0 }),
    ];

    const sorted = sortByResponseTime(questions);
    expect(sorted).toHaveLength(1);
    expect(sorted[0].questionNumber).toBe(1);
  });

  it("breaks ties by timesWrong descending", () => {
    const questions = [
      makeQuestion({
        questionNumber: 1,
        avgResponseTimeMs: 10000,
        totalSeen: 5,
        timesWrong: 1,
      }),
      makeQuestion({
        questionNumber: 2,
        avgResponseTimeMs: 10000,
        totalSeen: 5,
        timesWrong: 4,
      }),
    ];

    const sorted = sortByResponseTime(questions);
    expect(sorted.map((q) => q.questionNumber)).toEqual([2, 1]);
  });
});

// ============================================================================
// sortByMostSeen / sortByLeastSeen
// ============================================================================

describe("sortByMostSeen", () => {
  it("sorts by totalSeen descending", () => {
    const questions = [
      makeQuestion({ questionNumber: 1, totalSeen: 1 }),
      makeQuestion({ questionNumber: 2, totalSeen: 10 }),
      makeQuestion({ questionNumber: 3, totalSeen: 5 }),
    ];

    const sorted = sortByMostSeen(questions);
    expect(sorted.map((q) => q.questionNumber)).toEqual([2, 3, 1]);
  });
});

describe("sortByLeastSeen", () => {
  it("sorts by totalSeen ascending (unseen first)", () => {
    const questions = [
      makeQuestion({ questionNumber: 1, totalSeen: 5 }),
      makeQuestion({ questionNumber: 2, totalSeen: 0 }),
      makeQuestion({ questionNumber: 3, totalSeen: 2 }),
    ];

    const sorted = sortByLeastSeen(questions);
    expect(sorted.map((q) => q.questionNumber)).toEqual([2, 3, 1]);
  });
});

// ============================================================================
// sortByRecentlySeen
// ============================================================================

describe("sortByRecentlySeen", () => {
  it("sorts by lastSeenAt descending (most recent first)", () => {
    const questions = [
      makeQuestion({ questionNumber: 1, lastSeenAt: "2025-01-01T00:00:00Z" }),
      makeQuestion({ questionNumber: 2, lastSeenAt: "2025-06-15T00:00:00Z" }),
      makeQuestion({ questionNumber: 3, lastSeenAt: "2025-03-10T00:00:00Z" }),
    ];

    const sorted = sortByRecentlySeen(questions);
    expect(sorted.map((q) => q.questionNumber)).toEqual([2, 3, 1]);
  });

  it("puts unseen questions (empty lastSeenAt) at the end", () => {
    const questions = [
      makeQuestion({ questionNumber: 1, lastSeenAt: "" }),
      makeQuestion({ questionNumber: 2, lastSeenAt: "2025-06-15T00:00:00Z" }),
      makeQuestion({ questionNumber: 3, lastSeenAt: "" }),
    ];

    const sorted = sortByRecentlySeen(questions);
    expect(sorted[0].questionNumber).toBe(2);
    // Unseen questions at the end (relative order among them is stable)
    expect(sorted[1].lastSeenAt).toBe("");
    expect(sorted[2].lastSeenAt).toBe("");
  });
});

// ============================================================================
// sortQuestions (dispatcher)
// ============================================================================

describe("sortQuestions", () => {
  const questions = [
    makeQuestion({
      questionNumber: 1,
      timesWrong: 5,
      totalSeen: 10,
      avgResponseTimeMs: 3000,
      lastSeenAt: "2025-01-01T00:00:00Z",
    }),
    makeQuestion({
      questionNumber: 2,
      timesWrong: 1,
      totalSeen: 2,
      avgResponseTimeMs: 15000,
      lastSeenAt: "2025-06-01T00:00:00Z",
    }),
    makeQuestion({
      questionNumber: 3,
      timesWrong: 0,
      totalSeen: 0,
      avgResponseTimeMs: 0,
      lastSeenAt: "",
    }),
  ];

  it("dispatches mostWrong", () => {
    const sorted = sortQuestions(questions, "mostWrong");
    expect(sorted[0].questionNumber).toBe(1);
  });

  it("dispatches mostSeen", () => {
    const sorted = sortQuestions(questions, "mostSeen");
    expect(sorted[0].questionNumber).toBe(1);
  });

  it("dispatches leastSeen", () => {
    const sorted = sortQuestions(questions, "leastSeen");
    expect(sorted[0].questionNumber).toBe(3);
  });

  it("dispatches slowestResponse", () => {
    const sorted = sortQuestions(questions, "slowestResponse");
    expect(sorted[0].questionNumber).toBe(2);
  });

  it("dispatches recentlySeen", () => {
    const sorted = sortQuestions(questions, "recentlySeen");
    expect(sorted[0].questionNumber).toBe(2);
  });
});

// ============================================================================
// filterUnseenQuestions / filterSeenQuestions
// ============================================================================

describe("filterUnseenQuestions", () => {
  it("returns only questions with totalSeen === 0", () => {
    const questions = [
      makeQuestion({ questionNumber: 1, totalSeen: 5 }),
      makeQuestion({ questionNumber: 2, totalSeen: 0 }),
      makeQuestion({ questionNumber: 3, totalSeen: 0 }),
      makeQuestion({ questionNumber: 4, totalSeen: 1 }),
    ];

    const unseen = filterUnseenQuestions(questions);
    expect(unseen).toHaveLength(2);
    expect(unseen.map((q) => q.questionNumber)).toEqual([2, 3]);
  });

  it("returns empty array when all are seen", () => {
    const questions = [makeQuestion({ questionNumber: 1, totalSeen: 1 })];
    expect(filterUnseenQuestions(questions)).toEqual([]);
  });
});

describe("filterSeenQuestions", () => {
  it("returns only questions with totalSeen > 0", () => {
    const questions = [
      makeQuestion({ questionNumber: 1, totalSeen: 5 }),
      makeQuestion({ questionNumber: 2, totalSeen: 0 }),
    ];

    const seen = filterSeenQuestions(questions);
    expect(seen).toHaveLength(1);
    expect(seen[0].questionNumber).toBe(1);
  });
});

// ============================================================================
// filterByCategory
// ============================================================================

describe("filterByCategory", () => {
  it("returns questions matching the category", () => {
    const questions = [
      makeQuestion({ questionNumber: 1, categories: ["Law", "Admin"] }),
      makeQuestion({ questionNumber: 2, categories: ["Budget"] }),
      makeQuestion({ questionNumber: 3, categories: ["Law"] }),
    ];

    const result = filterByCategory(questions, "Law");
    expect(result).toHaveLength(2);
    expect(result.map((q) => q.questionNumber)).toEqual([1, 3]);
  });

  it("returns empty array when no match", () => {
    const questions = [
      makeQuestion({ questionNumber: 1, categories: ["Law"] }),
    ];
    expect(filterByCategory(questions, "Budget")).toEqual([]);
  });
});

// ============================================================================
// groupTelemetryByCategory
// ============================================================================

describe("groupTelemetryByCategory", () => {
  it("groups questions by category", () => {
    const questions = [
      makeQuestion({ questionNumber: 1, categories: ["Law"] }),
      makeQuestion({ questionNumber: 2, categories: ["Budget"] }),
      makeQuestion({ questionNumber: 3, categories: ["Law", "Budget"] }),
    ];

    const groups = groupTelemetryByCategory(questions);
    expect(groups.size).toBe(2);
    expect(groups.get("Law")!.map((q) => q.questionNumber)).toEqual([1, 3]);
    expect(groups.get("Budget")!.map((q) => q.questionNumber)).toEqual([2, 3]);
  });

  it("returns empty map for empty input", () => {
    expect(groupTelemetryByCategory([]).size).toBe(0);
  });
});

// ============================================================================
// computeUnseenByCategory
// ============================================================================

describe("computeUnseenByCategory", () => {
  it("counts unseen questions per category", () => {
    const questions = [
      makeQuestion({ questionNumber: 1, categories: ["Law"], totalSeen: 0 }),
      makeQuestion({ questionNumber: 2, categories: ["Law"], totalSeen: 5 }),
      makeQuestion({ questionNumber: 3, categories: ["Budget"], totalSeen: 0 }),
      makeQuestion({
        questionNumber: 4,
        categories: ["Law", "Budget"],
        totalSeen: 0,
      }),
    ];

    const counts = computeUnseenByCategory(questions);
    expect(counts.get("Law")).toBe(2); // Q1, Q4
    expect(counts.get("Budget")).toBe(2); // Q3, Q4
  });

  it("returns empty map when all are seen", () => {
    const questions = [
      makeQuestion({ questionNumber: 1, categories: ["Law"], totalSeen: 1 }),
    ];
    expect(computeUnseenByCategory(questions).size).toBe(0);
  });
});

// ============================================================================
// computeStability
// ============================================================================

describe("computeStability", () => {
  it("returns 'unseen' for questions never attempted", () => {
    const q = makeQuestion({ totalSeen: 0 });
    expect(computeStability(q)).toBe("unseen");
  });

  it("returns 'stable' for high consecutive correct with few wrongs", () => {
    const q = makeQuestion({
      totalSeen: 10,
      timesCorrect: 8,
      timesWrong: 2,
      consecutiveCorrect: 5,
    });
    expect(computeStability(q)).toBe("stable");
  });

  it("returns 'unstable' for questions with correct answers but timesWrong >= timesCorrect", () => {
    const q = makeQuestion({
      totalSeen: 10,
      timesCorrect: 3,
      timesWrong: 5,
      consecutiveCorrect: 1,
    });
    expect(computeStability(q)).toBe("unstable");
  });

  it("returns 'unlearned' for never correctly answered", () => {
    const q = makeQuestion({
      totalSeen: 5,
      timesCorrect: 0,
      timesWrong: 3,
      timesBlank: 2,
      consecutiveCorrect: 0,
    });
    expect(computeStability(q)).toBe("unlearned");
  });

  it("returns 'stable' for moderate correct with low wrongs", () => {
    const q = makeQuestion({
      totalSeen: 5,
      timesCorrect: 4,
      timesWrong: 1,
      consecutiveCorrect: 2,
    });
    expect(computeStability(q)).toBe("stable");
  });

  it("returns 'unstable' when timesCorrect > 0 and timesWrong equals timesCorrect", () => {
    const q = makeQuestion({
      totalSeen: 6,
      timesCorrect: 3,
      timesWrong: 3,
      consecutiveCorrect: 0,
    });
    expect(computeStability(q)).toBe("unstable");
  });
});

// ============================================================================
// formatResponseTime
// ============================================================================

describe("formatResponseTime", () => {
  it("formats milliseconds to seconds string", () => {
    expect(formatResponseTime(9200)).toBe("9.2s");
    expect(formatResponseTime(18300)).toBe("18.3s");
    expect(formatResponseTime(1000)).toBe("1.0s");
  });

  it("returns dash for zero", () => {
    expect(formatResponseTime(0)).toBe("—");
  });
});

// ============================================================================
// getTopFailedQuestions
// ============================================================================

describe("getTopFailedQuestions", () => {
  it("returns top N most failed questions", () => {
    const questions = [
      makeQuestion({ questionNumber: 1, timesWrong: 7, totalSeen: 9 }),
      makeQuestion({ questionNumber: 2, timesWrong: 0, totalSeen: 5 }),
      makeQuestion({ questionNumber: 3, timesWrong: 3, totalSeen: 4 }),
      makeQuestion({ questionNumber: 4, timesWrong: 5, totalSeen: 8 }),
    ];

    const top2 = getTopFailedQuestions(questions, 2);
    expect(top2).toHaveLength(2);
    expect(top2[0].questionNumber).toBe(1);
    expect(top2[1].questionNumber).toBe(4);
  });

  it("excludes questions with zero wrong answers", () => {
    const questions = [
      makeQuestion({ questionNumber: 1, timesWrong: 0 }),
      makeQuestion({ questionNumber: 2, timesWrong: 0 }),
    ];

    expect(getTopFailedQuestions(questions)).toEqual([]);
  });

  it("defaults to limit of 10", () => {
    const questions = Array.from({ length: 15 }, (_, i) =>
      makeQuestion({ questionNumber: i + 1, timesWrong: 15 - i }),
    );

    expect(getTopFailedQuestions(questions)).toHaveLength(10);
  });
});

// ============================================================================
// getTopSlowestQuestions
// ============================================================================

describe("getTopSlowestQuestions", () => {
  it("returns top N slowest questions", () => {
    const questions = [
      makeQuestion({
        questionNumber: 1,
        avgResponseTimeMs: 5000,
        totalSeen: 1,
      }),
      makeQuestion({
        questionNumber: 2,
        avgResponseTimeMs: 18000,
        totalSeen: 3,
      }),
      makeQuestion({
        questionNumber: 3,
        avgResponseTimeMs: 12000,
        totalSeen: 2,
      }),
    ];

    const top2 = getTopSlowestQuestions(questions, 2);
    expect(top2).toHaveLength(2);
    expect(top2[0].questionNumber).toBe(2);
    expect(top2[1].questionNumber).toBe(3);
  });

  it("excludes unseen questions", () => {
    const questions = [
      makeQuestion({ questionNumber: 1, avgResponseTimeMs: 0, totalSeen: 0 }),
      makeQuestion({
        questionNumber: 2,
        avgResponseTimeMs: 5000,
        totalSeen: 1,
      }),
    ];

    const result = getTopSlowestQuestions(questions);
    expect(result).toHaveLength(1);
    expect(result[0].questionNumber).toBe(2);
  });
});
