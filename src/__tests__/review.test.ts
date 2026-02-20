/**
 * Review Generation Module Unit Tests (M4 Specification)
 */

import { describe, it, expect } from "vitest";
import {
  generateReviewQuestionSet,
  generateReviewQuestionSetWithScores,
  type ReviewGenerationInput,
} from "../domain/review.js";
import type { QuestionTelemetry } from "../domain/types.js";
import type { WeaknessWeights } from "../domain/weakness.js";

// ============================================================================
// Test Helpers
// ============================================================================

const defaultWeights: WeaknessWeights = {
  wrongWeight: 2,
  blankWeight: 1.2,
  recoveryWeight: 1,
  weakTimeThresholdMs: 15000,
};

function createTelemetry(overrides: Partial<QuestionTelemetry> = {}): QuestionTelemetry {
  return {
    id: overrides.id ?? "exam1::1",
    examId: overrides.examId ?? "exam1",
    questionNumber: overrides.questionNumber ?? 1,
    timesCorrect: overrides.timesCorrect ?? 0,
    timesWrong: overrides.timesWrong ?? 0,
    timesBlank: overrides.timesBlank ?? 0,
    consecutiveCorrect: overrides.consecutiveCorrect ?? 0,
    avgResponseTimeMs: overrides.avgResponseTimeMs ?? 0,
    totalSeen: overrides.totalSeen ?? 0,
    lastSeenAt: overrides.lastSeenAt ?? "",
  };
}

// ============================================================================
// generateReviewQuestionSet Tests
// ============================================================================

describe("generateReviewQuestionSet", () => {
  it("filters correctly by exam", () => {
    const input: ReviewGenerationInput = {
      telemetryByQuestionId: {
        "exam1::1": createTelemetry({ id: "exam1::1", examId: "exam1", timesWrong: 5, totalSeen: 5 }),
        "exam1::2": createTelemetry({ id: "exam1::2", examId: "exam1", timesWrong: 4, totalSeen: 4 }),
        "exam2::1": createTelemetry({ id: "exam2::1", examId: "exam2", timesWrong: 10, totalSeen: 10 }),
        "exam2::2": createTelemetry({ id: "exam2::2", examId: "exam2", timesWrong: 9, totalSeen: 9 }),
      },
      questionBank: [
        { id: "exam1::1", examId: "exam1" },
        { id: "exam1::2", examId: "exam1" },
        { id: "exam2::1", examId: "exam2" },
        { id: "exam2::2", examId: "exam2" },
      ],
      selectedExamIds: ["exam1"],
      reviewQuestionCount: 10,
      weights: defaultWeights,
    };

    const result = generateReviewQuestionSet(input);

    // Should only include exam1 questions
    expect(result).toHaveLength(2);
    expect(result).toContain("exam1::1");
    expect(result).toContain("exam1::2");
    expect(result).not.toContain("exam2::1");
    expect(result).not.toContain("exam2::2");
  });

  it("filters correctly by multiple exams", () => {
    const input: ReviewGenerationInput = {
      telemetryByQuestionId: {
        "exam1::1": createTelemetry({ id: "exam1::1", examId: "exam1", timesWrong: 5, totalSeen: 5 }),
        "exam2::1": createTelemetry({ id: "exam2::1", examId: "exam2", timesWrong: 4, totalSeen: 4 }),
        "exam3::1": createTelemetry({ id: "exam3::1", examId: "exam3", timesWrong: 10, totalSeen: 10 }),
      },
      questionBank: [
        { id: "exam1::1", examId: "exam1" },
        { id: "exam2::1", examId: "exam2" },
        { id: "exam3::1", examId: "exam3" },
      ],
      selectedExamIds: ["exam1", "exam2"],
      reviewQuestionCount: 10,
      weights: defaultWeights,
    };

    const result = generateReviewQuestionSet(input);

    expect(result).toHaveLength(2);
    expect(result).toContain("exam1::1");
    expect(result).toContain("exam2::1");
    expect(result).not.toContain("exam3::1");
  });

  it("returns questions in correct descending weakness order", () => {
    const input: ReviewGenerationInput = {
      telemetryByQuestionId: {
        "exam1::1": createTelemetry({ id: "exam1::1", examId: "exam1", timesWrong: 1, totalSeen: 1 }), // weakScore: 2
        "exam1::2": createTelemetry({ id: "exam1::2", examId: "exam1", timesWrong: 5, totalSeen: 5 }), // weakScore: 10
        "exam1::3": createTelemetry({ id: "exam1::3", examId: "exam1", timesWrong: 3, totalSeen: 3 }), // weakScore: 6
        "exam1::4": createTelemetry({ id: "exam1::4", examId: "exam1", timesWrong: 0, totalSeen: 0 }), // weakScore: 0
      },
      questionBank: [
        { id: "exam1::1", examId: "exam1" },
        { id: "exam1::2", examId: "exam1" },
        { id: "exam1::3", examId: "exam1" },
        { id: "exam1::4", examId: "exam1" },
      ],
      selectedExamIds: ["exam1"],
      reviewQuestionCount: 4,
      weights: defaultWeights,
    };

    const result = generateReviewQuestionSet(input);

    // Should be in descending weakness order: 10, 6, 2, 0
    expect(result).toEqual(["exam1::2", "exam1::3", "exam1::1", "exam1::4"]);
  });

  it("uses proper tie-breaking: higher weakScore first", () => {
    const input: ReviewGenerationInput = {
      telemetryByQuestionId: {
        "exam1::1": createTelemetry({ id: "exam1::1", examId: "exam1", timesWrong: 2, totalSeen: 2 }), // weakScore: 4
        "exam1::2": createTelemetry({ id: "exam1::2", examId: "exam1", timesWrong: 3, totalSeen: 3 }), // weakScore: 6
        "exam1::3": createTelemetry({ id: "exam1::3", examId: "exam1", timesWrong: 2, totalSeen: 2 }), // weakScore: 4 (tie with ::1)
      },
      questionBank: [
        { id: "exam1::1", examId: "exam1" },
        { id: "exam1::2", examId: "exam1" },
        { id: "exam1::3", examId: "exam1" },
      ],
      selectedExamIds: ["exam1"],
      reviewQuestionCount: 3,
      weights: defaultWeights,
    };

    const result = generateReviewQuestionSet(input);

    // Highest weakScore first: exam1::2 (6), then the two with 4
    expect(result[0]).toBe("exam1::2");
  });

  it("uses proper tie-breaking: lower totalSeen first when weakScore tied", () => {
    const input: ReviewGenerationInput = {
      telemetryByQuestionId: {
        "exam1::1": createTelemetry({ 
          id: "exam1::1", 
          examId: "exam1", 
          timesWrong: 2, 
          totalSeen: 5, // higher totalSeen
          lastSeenAt: "2024-01-01T00:00:00Z",
        }), // weakScore: 4
        "exam1::2": createTelemetry({ 
          id: "exam1::2", 
          examId: "exam1", 
          timesWrong: 2, 
          totalSeen: 2, // lower totalSeen
          lastSeenAt: "2024-01-01T00:00:00Z",
        }), // weakScore: 4 (tie)
      },
      questionBank: [
        { id: "exam1::1", examId: "exam1" },
        { id: "exam1::2", examId: "exam1" },
      ],
      selectedExamIds: ["exam1"],
      reviewQuestionCount: 2,
      weights: defaultWeights,
    };

    const result = generateReviewQuestionSet(input);

    // Lower totalSeen first: exam1::2 (2 seen) before exam1::1 (5 seen)
    expect(result).toEqual(["exam1::2", "exam1::1"]);
  });

  it("uses proper tie-breaking: older lastSeenAt first when weakScore and totalSeen tied", () => {
    const input: ReviewGenerationInput = {
      telemetryByQuestionId: {
        "exam1::1": createTelemetry({ 
          id: "exam1::1", 
          examId: "exam1", 
          timesWrong: 2, 
          totalSeen: 2,
          lastSeenAt: "2024-01-03T00:00:00Z", // newer
        }),
        "exam1::2": createTelemetry({ 
          id: "exam1::2", 
          examId: "exam1", 
          timesWrong: 2, 
          totalSeen: 2,
          lastSeenAt: "2024-01-01T00:00:00Z", // older
        }),
      },
      questionBank: [
        { id: "exam1::1", examId: "exam1" },
        { id: "exam1::2", examId: "exam1" },
      ],
      selectedExamIds: ["exam1"],
      reviewQuestionCount: 2,
      weights: defaultWeights,
    };

    const result = generateReviewQuestionSet(input);

    // Older lastSeenAt first: exam1::2 (Jan 1) before exam1::1 (Jan 3)
    expect(result).toEqual(["exam1::2", "exam1::1"]);
  });

  it("uses proper tie-breaking: lexicographical ID when all else tied", () => {
    const input: ReviewGenerationInput = {
      telemetryByQuestionId: {
        "exam1::2": createTelemetry({ 
          id: "exam1::2", 
          examId: "exam1", 
          timesWrong: 2, 
          totalSeen: 2,
          lastSeenAt: "2024-01-01T00:00:00Z",
        }),
        "exam1::1": createTelemetry({ 
          id: "exam1::1", 
          examId: "exam1", 
          timesWrong: 2, 
          totalSeen: 2,
          lastSeenAt: "2024-01-01T00:00:00Z",
        }),
      },
      questionBank: [
        { id: "exam1::2", examId: "exam1" },
        { id: "exam1::1", examId: "exam1" },
      ],
      selectedExamIds: ["exam1"],
      reviewQuestionCount: 2,
      weights: defaultWeights,
    };

    const result = generateReviewQuestionSet(input);

    // Lexicographical order: "exam1::1" < "exam1::2"
    expect(result).toEqual(["exam1::1", "exam1::2"]);
  });

  it("places never seen questions (null lastSeenAt) before seen questions", () => {
    const input: ReviewGenerationInput = {
      telemetryByQuestionId: {
        "exam1::1": createTelemetry({ 
          id: "exam1::1", 
          examId: "exam1", 
          timesWrong: 0, 
          totalSeen: 0,
          lastSeenAt: "", // never seen
        }),
        "exam1::2": createTelemetry({ 
          id: "exam1::2", 
          examId: "exam1", 
          timesWrong: 0, 
          totalSeen: 1,
          lastSeenAt: "2024-01-01T00:00:00Z", // seen
        }),
      },
      questionBank: [
        { id: "exam1::1", examId: "exam1" },
        { id: "exam1::2", examId: "exam1" },
      ],
      selectedExamIds: ["exam1"],
      reviewQuestionCount: 2,
      weights: defaultWeights,
    };

    const result = generateReviewQuestionSetWithScores(input);

    // Both have weakScore 0, same totalSeen
    // Never seen (null lastSeenAt) should come first
    expect(result[0].lastSeenAt).toBeNull();
    expect(result[1].lastSeenAt).not.toBeNull();
  });

  it("returns exactly N questions when sufficient questions exist", () => {
    const input: ReviewGenerationInput = {
      telemetryByQuestionId: {
        "exam1::1": createTelemetry({ id: "exam1::1", examId: "exam1", timesWrong: 5, totalSeen: 5 }),
        "exam1::2": createTelemetry({ id: "exam1::2", examId: "exam1", timesWrong: 4, totalSeen: 4 }),
        "exam1::3": createTelemetry({ id: "exam1::3", examId: "exam1", timesWrong: 3, totalSeen: 3 }),
        "exam1::4": createTelemetry({ id: "exam1::4", examId: "exam1", timesWrong: 2, totalSeen: 2 }),
        "exam1::5": createTelemetry({ id: "exam1::5", examId: "exam1", timesWrong: 1, totalSeen: 1 }),
      },
      questionBank: [
        { id: "exam1::1", examId: "exam1" },
        { id: "exam1::2", examId: "exam1" },
        { id: "exam1::3", examId: "exam1" },
        { id: "exam1::4", examId: "exam1" },
        { id: "exam1::5", examId: "exam1" },
      ],
      selectedExamIds: ["exam1"],
      reviewQuestionCount: 3,
      weights: defaultWeights,
    };

    const result = generateReviewQuestionSet(input);

    expect(result).toHaveLength(3);
    // Should get the 3 weakest
    expect(result).toContain("exam1::1");
    expect(result).toContain("exam1::2");
    expect(result).toContain("exam1::3");
  });

  it("returns all questions when fewer than N exist", () => {
    const input: ReviewGenerationInput = {
      telemetryByQuestionId: {
        "exam1::1": createTelemetry({ id: "exam1::1", examId: "exam1", timesWrong: 5, totalSeen: 5 }),
        "exam1::2": createTelemetry({ id: "exam1::2", examId: "exam1", timesWrong: 4, totalSeen: 4 }),
      },
      questionBank: [
        { id: "exam1::1", examId: "exam1" },
        { id: "exam1::2", examId: "exam1" },
      ],
      selectedExamIds: ["exam1"],
      reviewQuestionCount: 10,
      weights: defaultWeights,
    };

    const result = generateReviewQuestionSet(input);

    expect(result).toHaveLength(2);
    expect(result).toContain("exam1::1");
    expect(result).toContain("exam1::2");
  });

  it("works with empty telemetry", () => {
    const input: ReviewGenerationInput = {
      telemetryByQuestionId: {},
      questionBank: [
        { id: "exam1::1", examId: "exam1" },
        { id: "exam1::2", examId: "exam1" },
        { id: "exam1::3", examId: "exam1" },
      ],
      selectedExamIds: ["exam1"],
      reviewQuestionCount: 5,
      weights: defaultWeights,
    };

    const result = generateReviewQuestionSet(input);

    // All questions have weakScore 0, should return all sorted by tie-breakers
    expect(result).toHaveLength(3);
    // Should be sorted by lexicographical ID since all scores are 0
    expect(result).toEqual(["exam1::1", "exam1::2", "exam1::3"]);
  });

  it("works when no weak questions exist (all have weakScore 0)", () => {
    const input: ReviewGenerationInput = {
      telemetryByQuestionId: {
        "exam1::1": createTelemetry({ id: "exam1::1", examId: "exam1", timesCorrect: 5, consecutiveCorrect: 5, totalSeen: 5 }),
        "exam1::2": createTelemetry({ id: "exam1::2", examId: "exam1", timesCorrect: 3, consecutiveCorrect: 3, totalSeen: 3 }),
      },
      questionBank: [
        { id: "exam1::1", examId: "exam1" },
        { id: "exam1::2", examId: "exam1" },
      ],
      selectedExamIds: ["exam1"],
      reviewQuestionCount: 2,
      weights: defaultWeights,
    };

    const result = generateReviewQuestionSet(input);

    // Both questions have weakScore 0 (recovered from consecutive correct)
    expect(result).toHaveLength(2);
  });

  it("fills remaining slots with least recently seen when insufficient weak questions", () => {
    const input: ReviewGenerationInput = {
      telemetryByQuestionId: {
        // One weak question
        "exam1::1": createTelemetry({ 
          id: "exam1::1", 
          examId: "exam1", 
          timesWrong: 5, 
          totalSeen: 5,
          lastSeenAt: "2024-01-01T00:00:00Z",
        }),
        // Two questions with weakScore 0, different last seen times
        "exam1::2": createTelemetry({ 
          id: "exam1::2", 
          examId: "exam1", 
          timesCorrect: 5, 
          consecutiveCorrect: 5, 
          totalSeen: 5,
          lastSeenAt: "2024-01-05T00:00:00Z", // seen most recently
        }),
        "exam1::3": createTelemetry({ 
          id: "exam1::3", 
          examId: "exam1", 
          timesCorrect: 3, 
          consecutiveCorrect: 3, 
          totalSeen: 3,
          lastSeenAt: "2024-01-02T00:00:00Z", // seen less recently
        }),
      },
      questionBank: [
        { id: "exam1::1", examId: "exam1" },
        { id: "exam1::2", examId: "exam1" },
        { id: "exam1::3", examId: "exam1" },
      ],
      selectedExamIds: ["exam1"],
      reviewQuestionCount: 3,
      weights: defaultWeights,
    };

    const result = generateReviewQuestionSet(input);

    expect(result).toHaveLength(3);
    // First should be the weak one
    expect(result[0]).toBe("exam1::1");
    // The rest should be filled with least recently seen
    // exam1::3 (Jan 2) was seen before exam1::2 (Jan 5)
    expect(result[1]).toBe("exam1::3");
    expect(result[2]).toBe("exam1::2");
  });

  it("is deterministic (same input always produces same output)", () => {
    const input: ReviewGenerationInput = {
      telemetryByQuestionId: {
        "exam1::1": createTelemetry({ id: "exam1::1", examId: "exam1", timesWrong: 3, totalSeen: 3 }),
        "exam1::2": createTelemetry({ id: "exam1::2", examId: "exam1", timesWrong: 2, totalSeen: 2 }),
        "exam1::3": createTelemetry({ id: "exam1::3", examId: "exam1", timesWrong: 1, totalSeen: 1 }),
      },
      questionBank: [
        { id: "exam1::1", examId: "exam1" },
        { id: "exam1::2", examId: "exam1" },
        { id: "exam1::3", examId: "exam1" },
      ],
      selectedExamIds: ["exam1"],
      reviewQuestionCount: 3,
      weights: defaultWeights,
    };

    const result1 = generateReviewQuestionSet(input);
    const result2 = generateReviewQuestionSet(input);
    const result3 = generateReviewQuestionSet(input);

    expect(result1).toEqual(result2);
    expect(result2).toEqual(result3);
  });

  it("does not mutate input", () => {
    const telemetry1 = createTelemetry({ id: "exam1::1", examId: "exam1", timesWrong: 3, totalSeen: 3 });
    const telemetry2 = createTelemetry({ id: "exam1::2", examId: "exam1", timesWrong: 2, totalSeen: 2 });
    
    const input: ReviewGenerationInput = {
      telemetryByQuestionId: {
        "exam1::1": telemetry1,
        "exam1::2": telemetry2,
      },
      questionBank: [
        { id: "exam1::1", examId: "exam1" },
        { id: "exam1::2", examId: "exam1" },
      ],
      selectedExamIds: ["exam1"],
      reviewQuestionCount: 2,
      weights: defaultWeights,
    };

    const originalTelemetry1 = { ...telemetry1 };
    const originalTelemetry2 = { ...telemetry2 };
    const originalInput = JSON.parse(JSON.stringify(input));

    generateReviewQuestionSet(input);

    expect(input.telemetryByQuestionId["exam1::1"]).toEqual(originalTelemetry1);
    expect(input.telemetryByQuestionId["exam1::2"]).toEqual(originalTelemetry2);
    expect(input).toEqual(originalInput);
  });

  it("handles questions without telemetry as never seen", () => {
    const input: ReviewGenerationInput = {
      telemetryByQuestionId: {
        "exam1::1": createTelemetry({ id: "exam1::1", examId: "exam1", timesWrong: 2, totalSeen: 2 }),
        // exam1::2 has no telemetry entry
      },
      questionBank: [
        { id: "exam1::1", examId: "exam1" },
        { id: "exam1::2", examId: "exam1" },
      ],
      selectedExamIds: ["exam1"],
      reviewQuestionCount: 2,
      weights: defaultWeights,
    };

    const result = generateReviewQuestionSetWithScores(input);

    // Both should be in result
    expect(result).toHaveLength(2);
    
    // Find each question in results
    const q1 = result.find(r => r.id === "exam1::1")!;
    const q2 = result.find(r => r.id === "exam1::2")!;

    // Question with telemetry has weakness score
    expect(q1.weakScore).toBe(4);
    expect(q1.totalSeen).toBe(2);

    // Question without telemetry has default values
    expect(q2.weakScore).toBe(0);
    expect(q2.totalSeen).toBe(0);
    expect(q2.lastSeenAt).toBeNull();
  });

  it("returns empty array when no questions match selected exams", () => {
    const input: ReviewGenerationInput = {
      telemetryByQuestionId: {
        "exam1::1": createTelemetry({ id: "exam1::1", examId: "exam1", timesWrong: 5, totalSeen: 5 }),
      },
      questionBank: [
        { id: "exam1::1", examId: "exam1" },
      ],
      selectedExamIds: ["exam2"], // Different exam
      reviewQuestionCount: 10,
      weights: defaultWeights,
    };

    const result = generateReviewQuestionSet(input);

    expect(result).toEqual([]);
  });

  it("returns empty array when questionBank is empty", () => {
    const input: ReviewGenerationInput = {
      telemetryByQuestionId: {},
      questionBank: [],
      selectedExamIds: ["exam1"],
      reviewQuestionCount: 10,
      weights: defaultWeights,
    };

    const result = generateReviewQuestionSet(input);

    expect(result).toEqual([]);
  });

  it("handles mixed time penalties correctly", () => {
    const input: ReviewGenerationInput = {
      telemetryByQuestionId: {
        // High weakness from wrong answers + time penalty
        "exam1::1": createTelemetry({ 
          id: "exam1::1", 
          examId: "exam1", 
          timesWrong: 2, 
          totalSeen: 2,
          avgResponseTimeMs: 30000, // 15 seconds above threshold
          lastSeenAt: "2024-01-01T00:00:00Z",
        }), // weakScore = 4 + 1 = 5
        // Same wrong answers, no time penalty
        "exam1::2": createTelemetry({ 
          id: "exam1::2", 
          examId: "exam1", 
          timesWrong: 2, 
          totalSeen: 2,
          avgResponseTimeMs: 10000, // below threshold
          lastSeenAt: "2024-01-01T00:00:00Z",
        }), // weakScore = 4 + 0 = 4
      },
      questionBank: [
        { id: "exam1::1", examId: "exam1" },
        { id: "exam1::2", examId: "exam1" },
      ],
      selectedExamIds: ["exam1"],
      reviewQuestionCount: 2,
      weights: defaultWeights,
    };

    const result = generateReviewQuestionSet(input);

    // Question with time penalty should come first (higher weakness)
    expect(result[0]).toBe("exam1::1");
    expect(result[1]).toBe("exam1::2");
  });

  it("handles recovery from consecutive correct answers", () => {
    const input: ReviewGenerationInput = {
      telemetryByQuestionId: {
        // More wrong answers but also consecutive correct (recovery)
        "exam1::1": createTelemetry({ 
          id: "exam1::1", 
          examId: "exam1", 
          timesWrong: 5,
          consecutiveCorrect: 5,
          totalSeen: 10,
          lastSeenAt: "2024-01-01T00:00:00Z",
        }), // weakScore = 10 - 5 = 5
        // Fewer wrong answers, no recovery
        "exam1::2": createTelemetry({ 
          id: "exam1::2", 
          examId: "exam1", 
          timesWrong: 3,
          consecutiveCorrect: 0,
          totalSeen: 3,
          lastSeenAt: "2024-01-01T00:00:00Z",
        }), // weakScore = 6
      },
      questionBank: [
        { id: "exam1::1", examId: "exam1" },
        { id: "exam1::2", examId: "exam1" },
      ],
      selectedExamIds: ["exam1"],
      reviewQuestionCount: 2,
      weights: defaultWeights,
    };

    const result = generateReviewQuestionSetWithScores(input);

    // Find each question in results
    const q1 = result.find(r => r.id === "exam1::1")!;
    const q2 = result.find(r => r.id === "exam1::2")!;

    expect(q1.weakScore).toBe(5);
    expect(q2.weakScore).toBe(6);
    
    // Question 2 should come first (higher weakness after recovery)
    expect(result[0].id).toBe("exam1::2");
    expect(result[1].id).toBe("exam1::1");
  });
});

// ============================================================================
// generateReviewQuestionSetWithScores Tests
// ============================================================================

describe("generateReviewQuestionSetWithScores", () => {
  it("returns question IDs with their weakness scores", () => {
    const input: ReviewGenerationInput = {
      telemetryByQuestionId: {
        "exam1::1": createTelemetry({ id: "exam1::1", examId: "exam1", timesWrong: 2, totalSeen: 2 }),
        "exam1::2": createTelemetry({ id: "exam1::2", examId: "exam1", timesWrong: 1, totalSeen: 1 }),
      },
      questionBank: [
        { id: "exam1::1", examId: "exam1" },
        { id: "exam1::2", examId: "exam1" },
      ],
      selectedExamIds: ["exam1"],
      reviewQuestionCount: 2,
      weights: defaultWeights,
    };

    const result = generateReviewQuestionSetWithScores(input);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("exam1::1");
    expect(result[0].weakScore).toBe(4);
    expect(result[1].id).toBe("exam1::2");
    expect(result[1].weakScore).toBe(2);
  });

  it("includes totalSeen and lastSeenAt in results", () => {
    const input: ReviewGenerationInput = {
      telemetryByQuestionId: {
        "exam1::1": createTelemetry({ 
          id: "exam1::1", 
          examId: "exam1", 
          timesWrong: 1, 
          totalSeen: 5,
          lastSeenAt: "2024-03-15T10:30:00Z",
        }),
      },
      questionBank: [
        { id: "exam1::1", examId: "exam1" },
      ],
      selectedExamIds: ["exam1"],
      reviewQuestionCount: 1,
      weights: defaultWeights,
    };

    const result = generateReviewQuestionSetWithScores(input);

    expect(result[0].totalSeen).toBe(5);
    expect(result[0].lastSeenAt).toBe(Date.parse("2024-03-15T10:30:00Z"));
  });

  it("returns null lastSeenAt for never seen questions", () => {
    const input: ReviewGenerationInput = {
      telemetryByQuestionId: {},
      questionBank: [
        { id: "exam1::1", examId: "exam1" },
      ],
      selectedExamIds: ["exam1"],
      reviewQuestionCount: 1,
      weights: defaultWeights,
    };

    const result = generateReviewQuestionSetWithScores(input);

    expect(result[0].lastSeenAt).toBeNull();
    expect(result[0].totalSeen).toBe(0);
    expect(result[0].weakScore).toBe(0);
  });
});
