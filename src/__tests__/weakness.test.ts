/**
 * Weakness calculation module unit tests
 */

import { describe, it, expect } from "vitest";
import {
  calculateWeakness,
  sortByWeakness,
  selectWeakestQuestions,
  createEmptyTelemetry,
  isQuestionMastered,
  DEFAULT_WEAKNESS_WEIGHTS,
  type WeaknessWeights,
} from "../domain/weakness.js";
import type { QuestionTelemetry } from "../domain/types.js";

describe("calculateWeakness", () => {
  it("returns 0 for empty telemetry with default weights", () => {
    const telemetry: QuestionTelemetry = {
      examId: "exam1",
      questionNumber: 1,
      timesCorrect: 0,
      timesWrong: 0,
      timesBlank: 0,
      consecutiveCorrect: 0,
      avgResponseTimeMs: 0,
      totalSeen: 0,
      lastSeenAt: null,
    };
    expect(calculateWeakness(telemetry)).toBe(0);
  });

  it("increases weakness for wrong answers", () => {
    const base: QuestionTelemetry = {
      examId: "exam1",
      questionNumber: 1,
      timesCorrect: 0,
      timesWrong: 0,
      timesBlank: 0,
      consecutiveCorrect: 0,
      avgResponseTimeMs: 0,
      totalSeen: 0,
      lastSeenAt: null,
    };

    const withWrong: QuestionTelemetry = { ...base, timesWrong: 2 };
    expect(calculateWeakness(withWrong)).toBe(4); // 2 * 2
  });

  it("increases weakness for blank answers", () => {
    const telemetry: QuestionTelemetry = {
      examId: "exam1",
      questionNumber: 1,
      timesCorrect: 0,
      timesWrong: 0,
      timesBlank: 2,
      consecutiveCorrect: 0,
      avgResponseTimeMs: 0,
      totalSeen: 0,
      lastSeenAt: null,
    };

    expect(calculateWeakness(telemetry)).toBeCloseTo(2.4, 1); // 2 * 1.2
  });

  it("decreases weakness for consecutive correct answers", () => {
    const telemetry: QuestionTelemetry = {
      examId: "exam1",
      questionNumber: 1,
      timesCorrect: 3,
      timesWrong: 2,
      timesBlank: 0,
      consecutiveCorrect: 3,
      avgResponseTimeMs: 0,
      totalSeen: 5,
      lastSeenAt: null,
    };

    // (2 * 2) + (0 * 1.2) - (3 * 1) = 4 - 3 = 1
    expect(calculateWeakness(telemetry)).toBe(1);
  });

  it("clamps weakness to minimum of 0", () => {
    const telemetry: QuestionTelemetry = {
      examId: "exam1",
      questionNumber: 1,
      timesCorrect: 5,
      timesWrong: 0,
      timesBlank: 0,
      consecutiveCorrect: 10,
      avgResponseTimeMs: 0,
      totalSeen: 5,
      lastSeenAt: null,
    };

    expect(calculateWeakness(telemetry)).toBe(0);
  });

  it("applies time penalty for slow responses", () => {
    const telemetry: QuestionTelemetry = {
      examId: "exam1",
      questionNumber: 1,
      timesCorrect: 0,
      timesWrong: 0,
      timesBlank: 0,
      consecutiveCorrect: 0,
      avgResponseTimeMs: 25000, // 25 seconds (above 15s threshold)
      totalSeen: 0,
      lastSeenAt: null,
    };

    // (25000 - 15000) * 0.001 = 10 * 0.001 = 10
    expect(calculateWeakness(telemetry)).toBeCloseTo(10, 0);
  });

  it("uses custom weights when provided", () => {
    const telemetry: QuestionTelemetry = {
      examId: "exam1",
      questionNumber: 1,
      timesCorrect: 0,
      timesWrong: 2,
      timesBlank: 0,
      consecutiveCorrect: 0,
      avgResponseTimeMs: 0,
      totalSeen: 0,
      lastSeenAt: null,
    };

    // Custom weights must match the expected type
    const customWeights: Partial<WeaknessWeights> = { wrongWeight: 5 };
    expect(calculateWeakness(telemetry, customWeights)).toBe(10); // 2 * 5
  });
});

describe("sortByWeakness", () => {
  it("sorts by weakness in descending order", () => {
    const items: QuestionTelemetry[] = [
      { examId: "e1", questionNumber: 1, timesCorrect: 0, timesWrong: 5, timesBlank: 0, consecutiveCorrect: 0, avgResponseTimeMs: 0, totalSeen: 5, lastSeenAt: null },
      { examId: "e1", questionNumber: 2, timesCorrect: 5, timesWrong: 0, timesBlank: 0, consecutiveCorrect: 5, avgResponseTimeMs: 0, totalSeen: 5, lastSeenAt: null },
      { examId: "e1", questionNumber: 3, timesCorrect: 0, timesWrong: 2, timesBlank: 0, consecutiveCorrect: 0, avgResponseTimeMs: 0, totalSeen: 2, lastSeenAt: null },
    ];

    const sorted = sortByWeakness(items);
    
    expect(sorted[0].telemetry.questionNumber).toBe(1); // Most wrong
    expect(sorted[1].telemetry.questionNumber).toBe(3);
    expect(sorted[2].telemetry.questionNumber).toBe(2); // Least wrong (mastered)
  });

  it("returns empty array for empty input", () => {
    expect(sortByWeakness([])).toEqual([]);
  });
});

describe("selectWeakestQuestions", () => {
  it("returns top N weakest questions", () => {
    const items: QuestionTelemetry[] = [
      { examId: "e1", questionNumber: 1, timesCorrect: 0, timesWrong: 5, timesBlank: 0, consecutiveCorrect: 0, avgResponseTimeMs: 0, totalSeen: 5, lastSeenAt: null },
      { examId: "e1", questionNumber: 2, timesCorrect: 5, timesWrong: 0, timesBlank: 0, consecutiveCorrect: 5, avgResponseTimeMs: 0, totalSeen: 5, lastSeenAt: null },
      { examId: "e1", questionNumber: 3, timesCorrect: 0, timesWrong: 3, timesBlank: 0, consecutiveCorrect: 0, avgResponseTimeMs: 0, totalSeen: 3, lastSeenAt: null },
      { examId: "e1", questionNumber: 4, timesCorrect: 0, timesWrong: 1, timesBlank: 0, consecutiveCorrect: 0, avgResponseTimeMs: 0, totalSeen: 1, lastSeenAt: null },
    ];

    const selected = selectWeakestQuestions(items, 2);
    
    expect(selected).toHaveLength(2);
    expect(selected[0].telemetry.questionNumber).toBe(1); // Most wrong
    expect(selected[1].telemetry.questionNumber).toBe(3);
  });

  it("returns all items if count exceeds length", () => {
    const items: QuestionTelemetry[] = [
      { examId: "e1", questionNumber: 1, timesCorrect: 0, timesWrong: 5, timesBlank: 0, consecutiveCorrect: 0, avgResponseTimeMs: 0, totalSeen: 5, lastSeenAt: null },
      { examId: "e1", questionNumber: 2, timesCorrect: 0, timesWrong: 1, timesBlank: 0, consecutiveCorrect: 0, avgResponseTimeMs: 0, totalSeen: 1, lastSeenAt: null },
    ];

    const selected = selectWeakestQuestions(items, 10);
    
    expect(selected).toHaveLength(2);
  });

  it("returns empty array for zero count", () => {
    const items: QuestionTelemetry[] = [
      { examId: "e1", questionNumber: 1, timesCorrect: 0, timesWrong: 5, timesBlank: 0, consecutiveCorrect: 0, avgResponseTimeMs: 0, totalSeen: 5, lastSeenAt: null },
    ];

    expect(selectWeakestQuestions(items, 0)).toEqual([]);
  });
});

describe("createEmptyTelemetry", () => {
  it("creates telemetry with all zeros", () => {
    const telemetry = createEmptyTelemetry("exam1", 5);
    
    expect(telemetry.examId).toBe("exam1");
    expect(telemetry.questionNumber).toBe(5);
    expect(telemetry.timesCorrect).toBe(0);
    expect(telemetry.timesWrong).toBe(0);
    expect(telemetry.timesBlank).toBe(0);
    expect(telemetry.consecutiveCorrect).toBe(0);
    expect(telemetry.avgResponseTimeMs).toBe(0);
    expect(telemetry.totalSeen).toBe(0);
    expect(telemetry.lastSeenAt).toBeNull();
  });
});

describe("isQuestionMastered", () => {
  it("returns true for sufficiently practiced and consecutive correct", () => {
    const telemetry: QuestionTelemetry = {
      examId: "e1",
      questionNumber: 1,
      timesCorrect: 5,
      timesWrong: 0,
      timesBlank: 0,
      consecutiveCorrect: 3,
      avgResponseTimeMs: 0,
      totalSeen: 5,
      lastSeenAt: null,
    };

    expect(isQuestionMastered(telemetry)).toBe(true);
  });

  it("returns false for insufficient consecutive correct", () => {
    const telemetry: QuestionTelemetry = {
      examId: "e1",
      questionNumber: 1,
      timesCorrect: 5,
      timesWrong: 0,
      timesBlank: 0,
      consecutiveCorrect: 2, // less than default 3
      avgResponseTimeMs: 0,
      totalSeen: 5,
      lastSeenAt: null,
    };

    expect(isQuestionMastered(telemetry)).toBe(false);
  });

  it("returns false for insufficient attempts", () => {
    const telemetry: QuestionTelemetry = {
      examId: "e1",
      questionNumber: 1,
      timesCorrect: 1,
      timesWrong: 0,
      timesBlank: 0,
      consecutiveCorrect: 3,
      avgResponseTimeMs: 0,
      totalSeen: 1, // less than default 2
      lastSeenAt: null,
    };

    expect(isQuestionMastered(telemetry)).toBe(false);
  });

  it("respects custom thresholds", () => {
    const telemetry: QuestionTelemetry = {
      examId: "e1",
      questionNumber: 1,
      timesCorrect: 2,
      timesWrong: 0,
      timesBlank: 0,
      consecutiveCorrect: 1,
      avgResponseTimeMs: 0,
      totalSeen: 2,
      lastSeenAt: null,
    };

    expect(isQuestionMastered(telemetry, 1, 1)).toBe(true);
  });
});

describe("DEFAULT_WEAKNESS_WEIGHTS", () => {
  it("has expected default values", () => {
    expect(DEFAULT_WEAKNESS_WEIGHTS.wrongWeight).toBe(2);
    expect(DEFAULT_WEAKNESS_WEIGHTS.blankWeight).toBeCloseTo(1.2, 1);
    expect(DEFAULT_WEAKNESS_WEIGHTS.recoveryWeight).toBe(1);
    expect(DEFAULT_WEAKNESS_WEIGHTS.weakTimeThresholdMs).toBe(15000);
  });
});
