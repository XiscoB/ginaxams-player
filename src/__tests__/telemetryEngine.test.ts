/**
 * Telemetry Engine Unit Tests
 *
 * Tests for pure domain logic in telemetry updates and weakness calculation.
 * No DOM, no IndexedDB - pure function testing.
 */

import { describe, it, expect } from "vitest";
import type { QuestionTelemetry } from "../domain/types.js";
import type { WeaknessWeights } from "../domain/weakness.js";
import { DEFAULTS } from "../domain/defaults.js";
import {
  updateTelemetry,
  resetTelemetryForExam,
  getTelemetryByExam,
  calculateWeakness,
  compareByWeakness,
  compareByLastSeen,
  sortByWeakness,
  sortByLastSeen,
  selectQuestionsForReview,
  mergeTelemetryUpdates,
} from "../domain/telemetryEngine.js";

// Test weights - explicit configuration injection
const TEST_WEIGHTS: WeaknessWeights = {
  wrongWeight: DEFAULTS.wrongWeight,
  blankWeight: DEFAULTS.blankWeight,
  recoveryWeight: DEFAULTS.recoveryWeight,
  weakTimeThresholdMs: DEFAULTS.weakTimeThresholdMs,
};


// Test fixtures
const TEST_EXAM_ID = "exam-123";
const TEST_QUESTION_NUMBER = 5;
const TEST_NOW = "2026-02-20T10:00:00.000Z";

// Helper to create a telemetry object for testing
function createTestTelemetry(
  overrides: Partial<QuestionTelemetry> = {}
): QuestionTelemetry {
  const examId = overrides.examId ?? TEST_EXAM_ID;
  const questionNumber = overrides.questionNumber ?? TEST_QUESTION_NUMBER;
  const id = overrides.id ?? `${examId}::${questionNumber}`;

  const base: QuestionTelemetry = {
    id,
    examId,
    questionNumber,
    timesCorrect: 0,
    timesWrong: 0,
    timesBlank: 0,
    consecutiveCorrect: 0,
    avgResponseTimeMs: 0,
    totalSeen: 0,
    lastSeenAt: "",
  };
  return { ...base, ...overrides };
}

describe("updateTelemetry", () => {
  it("returns existing unchanged for free mode", () => {
    const existing = createTestTelemetry({
      timesCorrect: 5,
      totalSeen: 5,
    });

    const result = updateTelemetry(existing, {
      attemptType: "free",
      examId: TEST_EXAM_ID,
      questionNumber: TEST_QUESTION_NUMBER,
      isCorrect: true,
      isBlank: false,
      responseTimeMs: 1000,
      now: TEST_NOW,
    });

    expect(result).toBe(existing); // Same reference
    expect(result).toEqual(existing); // Same values
  });

  it("returns null for free mode when existing is null", () => {
    const result = updateTelemetry(null, {
      attemptType: "free",
      examId: TEST_EXAM_ID,
      questionNumber: TEST_QUESTION_NUMBER,
      isCorrect: true,
      isBlank: false,
      responseTimeMs: 1000,
      now: TEST_NOW,
    });

    expect(result).toBeNull();
  });

  it("initializes fresh telemetry when existing is null (simulacro)", () => {
    const result = updateTelemetry(null, {
      attemptType: "simulacro",
      examId: TEST_EXAM_ID,
      questionNumber: TEST_QUESTION_NUMBER,
      isCorrect: true,
      isBlank: false,
      responseTimeMs: 5000,
      now: TEST_NOW,
    });

    expect(result).not.toBeNull();
    expect(result!.id).toBe(`${TEST_EXAM_ID}::${TEST_QUESTION_NUMBER}`);
    expect(result!.examId).toBe(TEST_EXAM_ID);
    expect(result!.questionNumber).toBe(TEST_QUESTION_NUMBER);
    expect(result!.timesCorrect).toBe(1);
    expect(result!.timesWrong).toBe(0);
    expect(result!.timesBlank).toBe(0);
    expect(result!.consecutiveCorrect).toBe(1);
    expect(result!.avgResponseTimeMs).toBe(5000);
    expect(result!.totalSeen).toBe(1);
    expect(result!.lastSeenAt).toBe(TEST_NOW);
  });

  it("initializes fresh telemetry when existing is null (review)", () => {
    const result = updateTelemetry(null, {
      attemptType: "review",
      examId: TEST_EXAM_ID,
      questionNumber: TEST_QUESTION_NUMBER,
      isCorrect: false,
      isBlank: false,
      responseTimeMs: 8000,
      now: TEST_NOW,
    });

    expect(result).not.toBeNull();
    expect(result!.timesCorrect).toBe(0);
    expect(result!.timesWrong).toBe(1);
    expect(result!.timesBlank).toBe(0);
    expect(result!.consecutiveCorrect).toBe(0);
    expect(result!.avgResponseTimeMs).toBe(8000);
    expect(result!.totalSeen).toBe(1);
  });

  it("handles first blank answer correctly", () => {
    const result = updateTelemetry(null, {
      attemptType: "simulacro",
      examId: TEST_EXAM_ID,
      questionNumber: TEST_QUESTION_NUMBER,
      isCorrect: false,
      isBlank: true,
      responseTimeMs: 3000,
      now: TEST_NOW,
    });

    expect(result).not.toBeNull();
    expect(result!.timesCorrect).toBe(0);
    expect(result!.timesWrong).toBe(0);
    expect(result!.timesBlank).toBe(1);
    expect(result!.consecutiveCorrect).toBe(0);
    expect(result!.totalSeen).toBe(1);
  });

  it("increments consecutiveCorrect on correct answers", () => {
    const existing = createTestTelemetry({
      timesCorrect: 3,
      consecutiveCorrect: 3,
      totalSeen: 5,
    });

    const result = updateTelemetry(existing, {
      attemptType: "simulacro",
      examId: TEST_EXAM_ID,
      questionNumber: TEST_QUESTION_NUMBER,
      isCorrect: true,
      isBlank: false,
      responseTimeMs: 4000,
      now: TEST_NOW,
    });

    expect(result!.timesCorrect).toBe(4);
    expect(result!.consecutiveCorrect).toBe(4);
    expect(result!.totalSeen).toBe(6);
  });

  it("resets consecutiveCorrect on wrong answer", () => {
    const existing = createTestTelemetry({
      timesCorrect: 5,
      consecutiveCorrect: 5,
      totalSeen: 5,
    });

    const result = updateTelemetry(existing, {
      attemptType: "review",
      examId: TEST_EXAM_ID,
      questionNumber: TEST_QUESTION_NUMBER,
      isCorrect: false,
      isBlank: false,
      responseTimeMs: 2000,
      now: TEST_NOW,
    });

    expect(result!.timesWrong).toBe(1);
    expect(result!.consecutiveCorrect).toBe(0);
    expect(result!.totalSeen).toBe(6);
  });

  it("resets consecutiveCorrect on blank answer", () => {
    const existing = createTestTelemetry({
      timesCorrect: 3,
      consecutiveCorrect: 3,
      totalSeen: 3,
    });

    const result = updateTelemetry(existing, {
      attemptType: "simulacro",
      examId: TEST_EXAM_ID,
      questionNumber: TEST_QUESTION_NUMBER,
      isCorrect: false,
      isBlank: true,
      responseTimeMs: 1000,
      now: TEST_NOW,
    });

    expect(result!.timesBlank).toBe(1);
    expect(result!.consecutiveCorrect).toBe(0);
    expect(result!.totalSeen).toBe(4);
  });

  it("calculates rolling average correctly (first entry)", () => {
    const result = updateTelemetry(null, {
      attemptType: "simulacro",
      examId: TEST_EXAM_ID,
      questionNumber: TEST_QUESTION_NUMBER,
      isCorrect: true,
      isBlank: false,
      responseTimeMs: 5000,
      now: TEST_NOW,
    });

    // First entry: avg = responseTimeMs
    expect(result!.avgResponseTimeMs).toBe(5000);
  });

  it("calculates rolling average correctly (subsequent entries)", () => {
    const existing = createTestTelemetry({
      avgResponseTimeMs: 5000,
      totalSeen: 2,
    });

    const result = updateTelemetry(existing, {
      attemptType: "review",
      examId: TEST_EXAM_ID,
      questionNumber: TEST_QUESTION_NUMBER,
      isCorrect: true,
      isBlank: false,
      responseTimeMs: 8000,
      now: TEST_NOW,
    });

    // Formula: ((5000 * 2) + 8000) / 3 = (10000 + 8000) / 3 = 6000
    expect(result!.avgResponseTimeMs).toBe(6000);
    expect(result!.totalSeen).toBe(3);
  });

  it("handles multiple updates in sequence", () => {
    let telemetry: QuestionTelemetry | null = null;

    // First attempt - correct, 5s
    telemetry = updateTelemetry(telemetry, {
      attemptType: "simulacro",
      examId: TEST_EXAM_ID,
      questionNumber: TEST_QUESTION_NUMBER,
      isCorrect: true,
      isBlank: false,
      responseTimeMs: 5000,
      now: "2026-02-20T10:00:00.000Z",
    });

    expect(telemetry!.timesCorrect).toBe(1);
    expect(telemetry!.consecutiveCorrect).toBe(1);
    expect(telemetry!.avgResponseTimeMs).toBe(5000);

    // Second attempt - correct, 7s
    telemetry = updateTelemetry(telemetry, {
      attemptType: "review",
      examId: TEST_EXAM_ID,
      questionNumber: TEST_QUESTION_NUMBER,
      isCorrect: true,
      isBlank: false,
      responseTimeMs: 7000,
      now: "2026-02-20T10:05:00.000Z",
    });

    expect(telemetry!.timesCorrect).toBe(2);
    expect(telemetry!.consecutiveCorrect).toBe(2);
    // ((5000 * 1) + 7000) / 2 = 6000
    expect(telemetry!.avgResponseTimeMs).toBe(6000);

    // Third attempt - wrong, 3s
    telemetry = updateTelemetry(telemetry, {
      attemptType: "simulacro",
      examId: TEST_EXAM_ID,
      questionNumber: TEST_QUESTION_NUMBER,
      isCorrect: false,
      isBlank: false,
      responseTimeMs: 3000,
      now: "2026-02-20T10:10:00.000Z",
    });

    expect(telemetry!.timesWrong).toBe(1);
    expect(telemetry!.consecutiveCorrect).toBe(0);
    expect(telemetry!.totalSeen).toBe(3);
  });

  it("throws on invalid examId", () => {
    expect(() =>
      updateTelemetry(null, {
        attemptType: "simulacro",
        examId: "",
        questionNumber: 1,
        isCorrect: true,
        isBlank: false,
        responseTimeMs: 1000,
        now: TEST_NOW,
      })
    ).toThrow("examId must be a non-empty string");
  });

  it("throws on invalid questionNumber", () => {
    expect(() =>
      updateTelemetry(null, {
        attemptType: "simulacro",
        examId: TEST_EXAM_ID,
        questionNumber: 0,
        isCorrect: true,
        isBlank: false,
        responseTimeMs: 1000,
        now: TEST_NOW,
      })
    ).toThrow("questionNumber must be a positive integer");
  });

  it("throws when isCorrect and isBlank are both true", () => {
    expect(() =>
      updateTelemetry(null, {
        attemptType: "simulacro",
        examId: TEST_EXAM_ID,
        questionNumber: 1,
        isCorrect: true,
        isBlank: true,
        responseTimeMs: 1000,
        now: TEST_NOW,
      })
    ).toThrow("isCorrect and isBlank cannot both be true");
  });

  it("throws on invalid responseTimeMs", () => {
    expect(() =>
      updateTelemetry(null, {
        attemptType: "simulacro",
        examId: TEST_EXAM_ID,
        questionNumber: 1,
        isCorrect: true,
        isBlank: false,
        responseTimeMs: -100,
        now: TEST_NOW,
      })
    ).toThrow("responseTimeMs must be a non-negative number");
  });

  it("throws on invalid now timestamp", () => {
    expect(() =>
      updateTelemetry(null, {
        attemptType: "simulacro",
        examId: TEST_EXAM_ID,
        questionNumber: 1,
        isCorrect: true,
        isBlank: false,
        responseTimeMs: 1000,
        now: "invalid-date",
      })
    ).toThrow("now must be a valid ISO date string");
  });

  it("returns immutable update (new object)", () => {
    const existing = createTestTelemetry();

    const result = updateTelemetry(existing, {
      attemptType: "simulacro",
      examId: TEST_EXAM_ID,
      questionNumber: TEST_QUESTION_NUMBER,
      isCorrect: true,
      isBlank: false,
      responseTimeMs: 1000,
      now: TEST_NOW,
    });

    expect(result).not.toBe(existing);
    expect(existing.totalSeen).toBe(0); // Original unchanged
    expect(result!.totalSeen).toBe(1); // New has updated value
  });
});

describe("resetTelemetryForExam", () => {
  it("removes only telemetry for specified exam", () => {
    const telemetry: QuestionTelemetry[] = [
      createTestTelemetry({ examId: "exam-1", questionNumber: 1 }),
      createTestTelemetry({ examId: "exam-1", questionNumber: 2 }),
      createTestTelemetry({ examId: "exam-2", questionNumber: 1 }),
      createTestTelemetry({ examId: "exam-2", questionNumber: 2 }),
      createTestTelemetry({ examId: "exam-3", questionNumber: 1 }),
    ];

    const result = resetTelemetryForExam(telemetry, "exam-1");

    expect(result).toHaveLength(3);
    expect(result.every((t) => t.examId !== "exam-1")).toBe(true);
    expect(result.some((t) => t.examId === "exam-2")).toBe(true);
    expect(result.some((t) => t.examId === "exam-3")).toBe(true);
  });

  it("returns empty array when all telemetry is for specified exam", () => {
    const telemetry: QuestionTelemetry[] = [
      createTestTelemetry({ examId: "exam-1", questionNumber: 1 }),
      createTestTelemetry({ examId: "exam-1", questionNumber: 2 }),
    ];

    const result = resetTelemetryForExam(telemetry, "exam-1");

    expect(result).toHaveLength(0);
  });

  it("returns unchanged array when exam not found", () => {
    const telemetry: QuestionTelemetry[] = [
      createTestTelemetry({ examId: "exam-1", questionNumber: 1 }),
      createTestTelemetry({ examId: "exam-2", questionNumber: 1 }),
    ];

    const result = resetTelemetryForExam(telemetry, "exam-3");

    expect(result).toHaveLength(2);
    expect(result).toEqual(telemetry);
  });

  it("returns empty array for empty input", () => {
    const result = resetTelemetryForExam([], "exam-1");
    expect(result).toHaveLength(0);
  });

  it("throws on invalid examId", () => {
    expect(() => resetTelemetryForExam([], "")).toThrow(
      "examId must be a non-empty string"
    );
  });

  it("does not mutate original array", () => {
    const telemetry: QuestionTelemetry[] = [
      createTestTelemetry({ examId: "exam-1", questionNumber: 1 }),
      createTestTelemetry({ examId: "exam-2", questionNumber: 1 }),
    ];

    const result = resetTelemetryForExam(telemetry, "exam-1");

    expect(telemetry).toHaveLength(2);
    expect(result).toHaveLength(1);
  });
});

describe("getTelemetryByExam", () => {
  it("returns only telemetry for specified exam", () => {
    const telemetry: QuestionTelemetry[] = [
      createTestTelemetry({ examId: "exam-1", questionNumber: 1 }),
      createTestTelemetry({ examId: "exam-1", questionNumber: 2 }),
      createTestTelemetry({ examId: "exam-2", questionNumber: 1 }),
      createTestTelemetry({ examId: "exam-2", questionNumber: 2 }),
    ];

    const result = getTelemetryByExam(telemetry, "exam-1");

    expect(result).toHaveLength(2);
    expect(result.every((t) => t.examId === "exam-1")).toBe(true);
  });

  it("returns empty array when exam not found", () => {
    const telemetry: QuestionTelemetry[] = [
      createTestTelemetry({ examId: "exam-1", questionNumber: 1 }),
    ];

    const result = getTelemetryByExam(telemetry, "exam-2");

    expect(result).toHaveLength(0);
  });

  it("throws on invalid examId", () => {
    expect(() => getTelemetryByExam([], "")).toThrow(
      "examId must be a non-empty string"
    );
  });
});

describe("calculateWeakness", () => {
  it("returns 0 for never seen question", () => {
    const telemetry = createTestTelemetry();
    expect(calculateWeakness(telemetry, TEST_WEIGHTS)).toBe(0);
  });

  it("calculates weakness with only wrong answers", () => {
    const telemetry = createTestTelemetry({
      timesWrong: 3,
      totalSeen: 3,
    });

    // 3 * 2 (wrongWeight) = 6
    expect(calculateWeakness(telemetry, TEST_WEIGHTS)).toBe(6);
  });

  it("calculates weakness with only blank answers", () => {
    const telemetry = createTestTelemetry({
      timesBlank: 5,
      totalSeen: 5,
    });

    // 5 * 1.2 (blankWeight) = 6
    expect(calculateWeakness(telemetry, TEST_WEIGHTS)).toBeCloseTo(6, 1);
  });

  it("calculates weakness with mixed mistakes", () => {
    const telemetry = createTestTelemetry({
      timesWrong: 2,
      timesBlank: 3,
      totalSeen: 5,
    });

    // (2 * 2) + (3 * 1.2) = 4 + 3.6 = 7.6
    expect(calculateWeakness(telemetry, TEST_WEIGHTS)).toBeCloseTo(7.6, 1);
  });

  it("applies recovery from consecutive correct answers", () => {
    const telemetry = createTestTelemetry({
      timesWrong: 3,
      consecutiveCorrect: 2,
      totalSeen: 5,
    });

    // (3 * 2) - (2 * 1) = 6 - 2 = 4
    expect(calculateWeakness(telemetry, TEST_WEIGHTS)).toBe(4);
  });

  it("clamps weakness to non-negative", () => {
    const telemetry = createTestTelemetry({
      timesWrong: 1,
      consecutiveCorrect: 5,
      totalSeen: 6,
    });

    // (1 * 2) - (5 * 1) = 2 - 5 = -3, clamped to 0
    expect(calculateWeakness(telemetry, TEST_WEIGHTS)).toBe(0);
  });

  it("applies time penalty for slow responses (M4 formula)", () => {
    const telemetry = createTestTelemetry({
      timesWrong: 1,
      avgResponseTimeMs: 30000, // Double the threshold
      totalSeen: 1,
    });

    // M4 Formula:
    // Base: 1 * 2 = 2
    // Time penalty: (30000-15000)/15000 = 1.0 (no capping in M4)
    // Total: 2 + 1.0 = 3.0
    expect(calculateWeakness(telemetry, TEST_WEIGHTS)).toBeCloseTo(3.0, 1);
  });

  it("applies proportional time penalty without capping (M4 formula)", () => {
    const telemetry = createTestTelemetry({
      timesWrong: 1,
      avgResponseTimeMs: 100000, // Way over threshold
      totalSeen: 1,
    });

    // M4 Formula (no capping):
    // Base: 1 * 2 = 2
    // Time penalty: (100000-15000)/15000 = 85000/15000 = 5.666...
    // Total: 2 + 5.666... = 7.666...
    expect(calculateWeakness(telemetry, TEST_WEIGHTS)).toBeCloseTo(7.666, 2);
  });

  it("uses custom weights when provided", () => {
    const telemetry = createTestTelemetry({
      timesWrong: 2,
      timesBlank: 2,
      totalSeen: 4,
    });

    // With custom weights: wrong=3, blank=2, recovery=1, threshold=15000
    // (2 * 3) + (2 * 2) = 6 + 4 = 10
    const customWeights: WeaknessWeights = {
      wrongWeight: 3,
      blankWeight: 2,
      recoveryWeight: 1,
      weakTimeThresholdMs: 15000,
    };
    expect(calculateWeakness(telemetry, customWeights)).toBeCloseTo(10, 0);
  });
});

describe("compareByWeakness", () => {
  it("sorts higher weakness first", () => {
    const weak = createTestTelemetry({ timesWrong: 5, totalSeen: 5 }); // weakness = 10
    const strong = createTestTelemetry({ timesCorrect: 5, totalSeen: 5 }); // weakness = 0

    // For descending sort: compareByWeakness(a, b) should return negative if a should come after b
    // weak (10) should come BEFORE strong (0), so compareByWeakness(weak, strong) should be negative
    expect(compareByWeakness(weak, strong, TEST_WEIGHTS)).toBeLessThan(0);
    expect(compareByWeakness(strong, weak, TEST_WEIGHTS)).toBeGreaterThan(0);
  });

  it("returns 0 for equal weakness", () => {
    const a = createTestTelemetry({ timesWrong: 2, totalSeen: 2 });
    const b = createTestTelemetry({ timesWrong: 2, totalSeen: 2 });

    expect(compareByWeakness(a, b, TEST_WEIGHTS)).toBe(0);
  });
});

describe("compareByLastSeen", () => {
  it("sorts older lastSeen first", () => {
    const older = createTestTelemetry({ lastSeenAt: "2026-02-20T10:00:00.000Z" });
    const newer = createTestTelemetry({ lastSeenAt: "2026-02-20T12:00:00.000Z" });

    expect(compareByLastSeen(older, newer)).toBeLessThan(0);
    expect(compareByLastSeen(newer, older)).toBeGreaterThan(0);
  });

  it("prioritizes never seen questions", () => {
    const neverSeen = createTestTelemetry({ lastSeenAt: "" });
    const seen = createTestTelemetry({ lastSeenAt: "2026-02-20T10:00:00.000Z" });

    expect(compareByLastSeen(neverSeen, seen)).toBeLessThan(0);
    expect(compareByLastSeen(seen, neverSeen)).toBeGreaterThan(0);
  });

  it("returns 0 for equal lastSeen", () => {
    const a = createTestTelemetry({ lastSeenAt: "2026-02-20T10:00:00.000Z" });
    const b = createTestTelemetry({ lastSeenAt: "2026-02-20T10:00:00.000Z" });

    expect(compareByLastSeen(a, b)).toBe(0);
  });

  it("returns 0 when both never seen", () => {
    const a = createTestTelemetry({ lastSeenAt: "" });
    const b = createTestTelemetry({ lastSeenAt: "" });

    expect(compareByLastSeen(a, b)).toBe(0);
  });
});

describe("sortByWeakness", () => {
  it("sorts by weakness descending", () => {
    const telemetry: QuestionTelemetry[] = [
      createTestTelemetry({ questionNumber: 1, timesCorrect: 5, totalSeen: 5 }), // Low weakness (0)
      createTestTelemetry({ questionNumber: 2, timesWrong: 5, totalSeen: 5 }), // High weakness (10)
      createTestTelemetry({ questionNumber: 3, timesWrong: 2, totalSeen: 5 }), // Medium weakness (4)
    ];

    const sorted = sortByWeakness(telemetry, TEST_WEIGHTS);

    expect(sorted[0].questionNumber).toBe(2); // Highest weakness
    expect(sorted[1].questionNumber).toBe(3); // Medium weakness
    expect(sorted[2].questionNumber).toBe(1); // Lowest weakness
  });

  it("does not mutate original array", () => {
    const telemetry: QuestionTelemetry[] = [
      createTestTelemetry({ questionNumber: 1, timesCorrect: 5, totalSeen: 5 }),
      createTestTelemetry({ questionNumber: 2, timesWrong: 5, totalSeen: 5 }),
    ];

    const sorted = sortByWeakness(telemetry, TEST_WEIGHTS);

    expect(telemetry[0].questionNumber).toBe(1); // Original unchanged
    expect(sorted[0].questionNumber).toBe(2); // Sorted has highest weakness first
  });
});

describe("sortByLastSeen", () => {
  it("sorts by lastSeen ascending", () => {
    const telemetry: QuestionTelemetry[] = [
      createTestTelemetry({ lastSeenAt: "2026-02-20T12:00:00.000Z" }),
      createTestTelemetry({ lastSeenAt: "2026-02-20T08:00:00.000Z" }),
      createTestTelemetry({ lastSeenAt: "2026-02-20T10:00:00.000Z" }),
    ];

    const sorted = sortByLastSeen(telemetry);

    expect(sorted[0].lastSeenAt).toBe("2026-02-20T08:00:00.000Z");
    expect(sorted[1].lastSeenAt).toBe("2026-02-20T10:00:00.000Z");
    expect(sorted[2].lastSeenAt).toBe("2026-02-20T12:00:00.000Z");
  });
});

describe("selectQuestionsForReview", () => {
  it("selects top N by weakness", () => {
    const telemetry: QuestionTelemetry[] = [
      createTestTelemetry({ questionNumber: 1, timesWrong: 5, totalSeen: 5 }), // weakness: 10
      createTestTelemetry({ questionNumber: 2, timesWrong: 4, totalSeen: 5 }), // weakness: 8
      createTestTelemetry({ questionNumber: 3, timesWrong: 3, totalSeen: 5 }), // weakness: 6
      createTestTelemetry({ questionNumber: 4, timesWrong: 2, totalSeen: 5 }), // weakness: 4
      createTestTelemetry({ questionNumber: 5, timesCorrect: 5, totalSeen: 5 }), // weakness: 0
    ];

    const selected = selectQuestionsForReview(telemetry, 3, TEST_WEIGHTS);

    expect(selected).toHaveLength(3);
    expect(selected[0].questionNumber).toBe(1); // Most weak
    expect(selected[1].questionNumber).toBe(2);
    expect(selected[2].questionNumber).toBe(3);
  });

  it("fills with least recently seen if insufficient weak questions", () => {
    const telemetry: QuestionTelemetry[] = [
      createTestTelemetry({
        questionNumber: 1,
        timesWrong: 5,
        totalSeen: 5,
        lastSeenAt: "2026-02-20T10:00:00.000Z",
      }), // weakness: 10
      createTestTelemetry({
        questionNumber: 2,
        timesCorrect: 5,
        totalSeen: 5,
        lastSeenAt: "2026-02-20T08:00:00.000Z",
      }), // weakness: 0 (least recently seen)
      createTestTelemetry({
        questionNumber: 3,
        timesCorrect: 5,
        totalSeen: 5,
        lastSeenAt: "2026-02-20T12:00:00.000Z",
      }), // weakness: 0 (most recently seen)
    ];

    const selected = selectQuestionsForReview(telemetry, 3, TEST_WEIGHTS);

    expect(selected).toHaveLength(3);
    expect(selected[0].questionNumber).toBe(1); // Weak first
    expect(selected[1].questionNumber).toBe(2); // Least recently seen
    expect(selected[2].questionNumber).toBe(3);
  });

  it("returns all questions if fewer than requested", () => {
    const telemetry: QuestionTelemetry[] = [
      createTestTelemetry({ questionNumber: 1 }),
      createTestTelemetry({ questionNumber: 2 }),
    ];

    const selected = selectQuestionsForReview(telemetry, 10, TEST_WEIGHTS);

    expect(selected).toHaveLength(2);
  });

  it("returns empty array for empty input", () => {
    const selected = selectQuestionsForReview([], 10, TEST_WEIGHTS);
    expect(selected).toHaveLength(0);
  });

  it("throws on invalid count", () => {
    expect(() => selectQuestionsForReview([], 0, TEST_WEIGHTS)).toThrow(
      "count must be a positive integer"
    );
    expect(() => selectQuestionsForReview([], -1, TEST_WEIGHTS)).toThrow(
      "count must be a positive integer"
    );
  });

  it("selects specified count with explicit weights", () => {
    const telemetry = Array.from({ length: 100 }, (_, i) =>
      createTestTelemetry({ questionNumber: i + 1, timesWrong: 1, totalSeen: 1 })
    );

    const selected = selectQuestionsForReview(telemetry, 60, TEST_WEIGHTS);

    expect(selected).toHaveLength(60);
  });
});

describe("mergeTelemetryUpdates", () => {
  it("adds new telemetry entries", () => {
    const existing: QuestionTelemetry[] = [
      createTestTelemetry({ examId: "exam-1", questionNumber: 1 }),
    ];

    const updates: QuestionTelemetry[] = [
      createTestTelemetry({ examId: "exam-1", questionNumber: 2 }),
    ];

    const result = mergeTelemetryUpdates(existing, updates);

    expect(result).toHaveLength(2);
    expect(result.some((t) => t.questionNumber === 2)).toBe(true);
  });

  it("replaces existing telemetry entries by id", () => {
    const existing: QuestionTelemetry[] = [
      createTestTelemetry({
        examId: "exam-1",
        questionNumber: 1,
        timesCorrect: 1,
        totalSeen: 1,
      }),
    ];

    const updates: QuestionTelemetry[] = [
      createTestTelemetry({
        examId: "exam-1",
        questionNumber: 1,
        timesCorrect: 2,
        timesWrong: 1,
        totalSeen: 3,
      }),
    ];

    const result = mergeTelemetryUpdates(existing, updates);

    expect(result).toHaveLength(1);
    expect(result[0].timesCorrect).toBe(2);
    expect(result[0].timesWrong).toBe(1);
    expect(result[0].totalSeen).toBe(3);
  });

  it("does not mutate original array", () => {
    const existing: QuestionTelemetry[] = [
      createTestTelemetry({ examId: "exam-1", questionNumber: 1 }),
    ];

    const updates: QuestionTelemetry[] = [
      createTestTelemetry({ examId: "exam-1", questionNumber: 2 }),
    ];

    const result = mergeTelemetryUpdates(existing, updates);

    expect(existing).toHaveLength(1);
    expect(result).toHaveLength(2);
  });
});

describe("TEST_WEIGHTS", () => {
  it("has expected default values", () => {
    expect(TEST_WEIGHTS.wrongWeight).toBe(2);
    expect(TEST_WEIGHTS.blankWeight).toBe(1.2);
    expect(TEST_WEIGHTS.recoveryWeight).toBe(1);
    expect(TEST_WEIGHTS.weakTimeThresholdMs).toBe(15000);
  });
});
