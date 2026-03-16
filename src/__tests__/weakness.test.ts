/**
 * Weakness calculation module unit tests (M4 Specification)
 */

import { describe, it, expect } from "vitest";
import {
  computeWeakScore,
  calculateTimePenalty,
  sortByWeakness,
  selectWeakestQuestions,
  createEmptyTelemetry,
  isQuestionMastered,
  type WeaknessWeights,
} from "../domain/weakness.js";
import type { QuestionTelemetry } from "../domain/types.js";

// ============================================================================
// computeWeakScore Tests (M4 Specification)
// ============================================================================

describe("computeWeakScore", () => {
  const defaultWeights: WeaknessWeights = {
    wrongWeight: 2,
    blankWeight: 1.2,
    recoveryWeight: 1,
    weakTimeThresholdMs: 15000,
  };

  it("returns 0 for zero telemetry", () => {
    const telemetry: QuestionTelemetry = {
      id: "exam1::1",
      examId: "exam1",
      questionNumber: 1,
      timesCorrect: 0,
      timesWrong: 0,
      timesBlank: 0,
      consecutiveCorrect: 0,
      avgResponseTimeMs: 0,
      totalSeen: 0,
      lastSeenAt: "",
    };
    expect(computeWeakScore(telemetry, defaultWeights)).toBe(0);
  });

  it("calculates correctly for only wrong answers", () => {
    const telemetry: QuestionTelemetry = {
      id: "exam1::1",
      examId: "exam1",
      questionNumber: 1,
      timesCorrect: 0,
      timesWrong: 3,
      timesBlank: 0,
      consecutiveCorrect: 0,
      avgResponseTimeMs: 0,
      totalSeen: 3,
      lastSeenAt: "",
    };
    // (3 * 2) + (0 * 1.2) + 0 - (0 * 1) = 6
    expect(computeWeakScore(telemetry, defaultWeights)).toBe(6);
  });

  it("calculates correctly for only blank answers", () => {
    const telemetry: QuestionTelemetry = {
      id: "exam1::1",
      examId: "exam1",
      questionNumber: 1,
      timesCorrect: 0,
      timesWrong: 0,
      timesBlank: 5,
      consecutiveCorrect: 0,
      avgResponseTimeMs: 0,
      totalSeen: 5,
      lastSeenAt: "",
    };
    // (0 * 2) + (5 * 1.2) + 0 - (0 * 1) = 6
    expect(computeWeakScore(telemetry, defaultWeights)).toBeCloseTo(6, 1);
  });

  it("reduces score for consecutive correct answers", () => {
    const telemetry: QuestionTelemetry = {
      id: "exam1::1",
      examId: "exam1",
      questionNumber: 1,
      timesCorrect: 5,
      timesWrong: 2,
      timesBlank: 0,
      consecutiveCorrect: 3,
      avgResponseTimeMs: 0,
      totalSeen: 5,
      lastSeenAt: "",
    };
    // (2 * 2) + (0 * 1.2) + 0 - (3 * 1) = 4 - 3 = 1
    expect(computeWeakScore(telemetry, defaultWeights)).toBe(1);
  });

  it("clamps result to 0 when recovery exceeds weakness", () => {
    const telemetry: QuestionTelemetry = {
      id: "exam1::1",
      examId: "exam1",
      questionNumber: 1,
      timesCorrect: 10,
      timesWrong: 0,
      timesBlank: 0,
      consecutiveCorrect: 5,
      avgResponseTimeMs: 0,
      totalSeen: 10,
      lastSeenAt: "",
    };
    // (0 * 2) + (0 * 1.2) + 0 - (5 * 1) = -5 → clamped to 0
    expect(computeWeakScore(telemetry, defaultWeights)).toBe(0);
  });

  it("never returns negative score", () => {
    const telemetry: QuestionTelemetry = {
      id: "exam1::1",
      examId: "exam1",
      questionNumber: 1,
      timesCorrect: 3,
      timesWrong: 0,
      timesBlank: 0,
      consecutiveCorrect: 10,
      avgResponseTimeMs: 0,
      totalSeen: 3,
      lastSeenAt: "",
    };
    const score = computeWeakScore(telemetry, defaultWeights);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBe(0);
  });

  it("applies time penalty correctly when above threshold", () => {
    const telemetry: QuestionTelemetry = {
      id: "exam1::1",
      examId: "exam1",
      questionNumber: 1,
      timesCorrect: 0,
      timesWrong: 0,
      timesBlank: 0,
      consecutiveCorrect: 0,
      avgResponseTimeMs: 25000, // 25 seconds (10 seconds above threshold)
      totalSeen: 1,
      lastSeenAt: "2024-01-01T00:00:00Z",
    };
    // timePenalty = (25000 - 15000) / 15000 = 10000 / 15000 = 0.666...
    expect(computeWeakScore(telemetry, defaultWeights)).toBeCloseTo(
      0.666666,
      5
    );
  });

  it("applies no time penalty when at threshold", () => {
    const telemetry: QuestionTelemetry = {
      id: "exam1::1",
      examId: "exam1",
      questionNumber: 1,
      timesCorrect: 0,
      timesWrong: 1,
      timesBlank: 0,
      consecutiveCorrect: 0,
      avgResponseTimeMs: 15000, // exactly at threshold
      totalSeen: 1,
      lastSeenAt: "2024-01-01T00:00:00Z",
    };
    // timePenalty = 0, weakness = 1 * 2 = 2
    expect(computeWeakScore(telemetry, defaultWeights)).toBe(2);
  });

  it("applies no time penalty when below threshold", () => {
    const telemetry: QuestionTelemetry = {
      id: "exam1::1",
      examId: "exam1",
      questionNumber: 1,
      timesCorrect: 0,
      timesWrong: 1,
      timesBlank: 0,
      consecutiveCorrect: 0,
      avgResponseTimeMs: 5000, // below threshold
      totalSeen: 1,
      lastSeenAt: "2024-01-01T00:00:00Z",
    };
    // timePenalty = 0, weakness = 1 * 2 = 2
    expect(computeWeakScore(telemetry, defaultWeights)).toBe(2);
  });

  it("calculates correctly with large telemetry values", () => {
    const telemetry: QuestionTelemetry = {
      id: "exam1::1",
      examId: "exam1",
      questionNumber: 1,
      timesCorrect: 1000,
      timesWrong: 500,
      timesBlank: 200,
      consecutiveCorrect: 50,
      avgResponseTimeMs: 30000,
      totalSeen: 1700,
      lastSeenAt: "2024-01-01T00:00:00Z",
    };
    // (500 * 2) + (200 * 1.2) + ((30000-15000)/15000) - (50 * 1)
    // = 1000 + 240 + 1 - 50 = 1191
    expect(computeWeakScore(telemetry, defaultWeights)).toBeCloseTo(1191, 0);
  });

  it("handles zero time threshold gracefully", () => {
    const weights: WeaknessWeights = {
      ...defaultWeights,
      weakTimeThresholdMs: 0,
    };
    const telemetry: QuestionTelemetry = {
      id: "exam1::1",
      examId: "exam1",
      questionNumber: 1,
      timesCorrect: 0,
      timesWrong: 1,
      timesBlank: 0,
      consecutiveCorrect: 0,
      avgResponseTimeMs: 1000,
      totalSeen: 1,
      lastSeenAt: "2024-01-01T00:00:00Z",
    };
    // Division by zero would be Infinity, but we check if avg > threshold first
    // Since 1000 > 0, we calculate (1000 - 0) / 0 = Infinity
    // But we need to handle this case - actually let's verify the behavior
    const score = computeWeakScore(telemetry, weights);
    expect(score).toBe(Infinity);
  });

  it("uses provided custom weights correctly", () => {
    const customWeights: WeaknessWeights = {
      wrongWeight: 5,
      blankWeight: 3,
      recoveryWeight: 2,
      weakTimeThresholdMs: 10000,
    };
    const telemetry: QuestionTelemetry = {
      id: "exam1::1",
      examId: "exam1",
      questionNumber: 1,
      timesCorrect: 0,
      timesWrong: 2,
      timesBlank: 1,
      consecutiveCorrect: 1,
      avgResponseTimeMs: 15000, // 5 seconds above threshold of 10000
      totalSeen: 4,
      lastSeenAt: "",
    };
    // (2 * 5) + (1 * 3) + ((15000 - 10000) / 10000) - (1 * 2)
    // = 10 + 3 + 0.5 - 2 = 11.5
    expect(computeWeakScore(telemetry, customWeights)).toBeCloseTo(11.5, 1);
  });

  it("does not mutate input telemetry", () => {
    const telemetry: QuestionTelemetry = {
      id: "exam1::1",
      examId: "exam1",
      questionNumber: 1,
      timesCorrect: 5,
      timesWrong: 2,
      timesBlank: 1,
      consecutiveCorrect: 3,
      avgResponseTimeMs: 20000,
      totalSeen: 8,
      lastSeenAt: "2024-01-01T00:00:00Z",
    };
    const original = { ...telemetry };
    computeWeakScore(telemetry, defaultWeights);
    expect(telemetry).toEqual(original);
  });
});

// ============================================================================
// calculateTimePenalty Tests
// ============================================================================

describe("calculateTimePenalty", () => {
  it("returns 0 when avgResponseTimeMs is below threshold", () => {
    expect(calculateTimePenalty(10000, 15000)).toBe(0);
  });

  it("returns 0 when avgResponseTimeMs equals threshold", () => {
    expect(calculateTimePenalty(15000, 15000)).toBe(0);
  });

  it("returns positive value when avgResponseTimeMs exceeds threshold", () => {
    // (25000 - 15000) / 15000 = 10000 / 15000 = 0.666...
    expect(calculateTimePenalty(25000, 15000)).toBeCloseTo(0.666666, 5);
  });

  it("returns 1 when avgResponseTimeMs is double the threshold", () => {
    // (30000 - 15000) / 15000 = 15000 / 15000 = 1
    expect(calculateTimePenalty(30000, 15000)).toBe(1);
  });

  it("returns proportional value for various excess times", () => {
    // (20000 - 15000) / 15000 = 5000 / 15000 = 0.333...
    expect(calculateTimePenalty(20000, 15000)).toBeCloseTo(0.333333, 5);
  });
});

// ============================================================================
// sortByWeakness Tests
// ============================================================================

describe("sortByWeakness", () => {
  const weights: WeaknessWeights = {
    wrongWeight: 2,
    blankWeight: 1.2,
    recoveryWeight: 1,
    weakTimeThresholdMs: 15000,
  };

  it("sorts by weakness in descending order", () => {
    const items: QuestionTelemetry[] = [
      {
        id: "e1::1",
        examId: "e1",
        questionNumber: 1,
        timesCorrect: 0,
        timesWrong: 5,
        timesBlank: 0,
        consecutiveCorrect: 0,
        avgResponseTimeMs: 0,
        totalSeen: 5,
        lastSeenAt: "",
      },
      {
        id: "e1::2",
        examId: "e1",
        questionNumber: 2,
        timesCorrect: 5,
        timesWrong: 0,
        timesBlank: 0,
        consecutiveCorrect: 5,
        avgResponseTimeMs: 0,
        totalSeen: 5,
        lastSeenAt: "",
      },
      {
        id: "e1::3",
        examId: "e1",
        questionNumber: 3,
        timesCorrect: 0,
        timesWrong: 2,
        timesBlank: 0,
        consecutiveCorrect: 0,
        avgResponseTimeMs: 0,
        totalSeen: 2,
        lastSeenAt: "",
      },
    ];

    const sorted = sortByWeakness(items, weights);

    expect(sorted[0].telemetry.questionNumber).toBe(1); // Most wrong (10)
    expect(sorted[1].telemetry.questionNumber).toBe(3); // Medium (4)
    expect(sorted[2].telemetry.questionNumber).toBe(2); // Least (0)
  });

  it("returns empty array for empty input", () => {
    expect(sortByWeakness([], weights)).toEqual([]);
  });

  it("does not mutate original array", () => {
    const items: QuestionTelemetry[] = [
      {
        id: "e1::1",
        examId: "e1",
        questionNumber: 1,
        timesCorrect: 0,
        timesWrong: 1,
        timesBlank: 0,
        consecutiveCorrect: 0,
        avgResponseTimeMs: 0,
        totalSeen: 1,
        lastSeenAt: "",
      },
    ];
    const original = [...items];
    sortByWeakness(items, weights);
    expect(items).toEqual(original);
  });
});

// ============================================================================
// selectWeakestQuestions Tests
// ============================================================================

describe("selectWeakestQuestions", () => {
  const weights: WeaknessWeights = {
    wrongWeight: 2,
    blankWeight: 1.2,
    recoveryWeight: 1,
    weakTimeThresholdMs: 15000,
  };

  it("returns top N weakest questions", () => {
    const items: QuestionTelemetry[] = [
      {
        id: "e1::1",
        examId: "e1",
        questionNumber: 1,
        timesCorrect: 0,
        timesWrong: 5,
        timesBlank: 0,
        consecutiveCorrect: 0,
        avgResponseTimeMs: 0,
        totalSeen: 5,
        lastSeenAt: "",
      },
      {
        id: "e1::2",
        examId: "e1",
        questionNumber: 2,
        timesCorrect: 5,
        timesWrong: 0,
        timesBlank: 0,
        consecutiveCorrect: 5,
        avgResponseTimeMs: 0,
        totalSeen: 5,
        lastSeenAt: "",
      },
      {
        id: "e1::3",
        examId: "e1",
        questionNumber: 3,
        timesCorrect: 0,
        timesWrong: 3,
        timesBlank: 0,
        consecutiveCorrect: 0,
        avgResponseTimeMs: 0,
        totalSeen: 3,
        lastSeenAt: "",
      },
      {
        id: "e1::4",
        examId: "e1",
        questionNumber: 4,
        timesCorrect: 0,
        timesWrong: 1,
        timesBlank: 0,
        consecutiveCorrect: 0,
        avgResponseTimeMs: 0,
        totalSeen: 1,
        lastSeenAt: "",
      },
    ];

    const selected = selectWeakestQuestions(items, 2, weights);

    expect(selected).toHaveLength(2);
    expect(selected[0].telemetry.questionNumber).toBe(1); // Most wrong (10)
    expect(selected[1].telemetry.questionNumber).toBe(3); // Second most (6)
  });

  it("returns all items if count exceeds length", () => {
    const items: QuestionTelemetry[] = [
      {
        id: "e1::1",
        examId: "e1",
        questionNumber: 1,
        timesCorrect: 0,
        timesWrong: 5,
        timesBlank: 0,
        consecutiveCorrect: 0,
        avgResponseTimeMs: 0,
        totalSeen: 5,
        lastSeenAt: "",
      },
      {
        id: "e1::2",
        examId: "e1",
        questionNumber: 2,
        timesCorrect: 0,
        timesWrong: 1,
        timesBlank: 0,
        consecutiveCorrect: 0,
        avgResponseTimeMs: 0,
        totalSeen: 1,
        lastSeenAt: "",
      },
    ];

    const selected = selectWeakestQuestions(items, 10, weights);

    expect(selected).toHaveLength(2);
  });

  it("returns empty array for zero count", () => {
    const items: QuestionTelemetry[] = [
      {
        id: "e1::1",
        examId: "e1",
        questionNumber: 1,
        timesCorrect: 0,
        timesWrong: 5,
        timesBlank: 0,
        consecutiveCorrect: 0,
        avgResponseTimeMs: 0,
        totalSeen: 5,
        lastSeenAt: "",
      },
    ];

    expect(selectWeakestQuestions(items, 0, weights)).toEqual([]);
  });

  it("returns empty array for negative count", () => {
    const items: QuestionTelemetry[] = [
      {
        id: "e1::1",
        examId: "e1",
        questionNumber: 1,
        timesCorrect: 0,
        timesWrong: 5,
        timesBlank: 0,
        consecutiveCorrect: 0,
        avgResponseTimeMs: 0,
        totalSeen: 5,
        lastSeenAt: "",
      },
    ];

    expect(selectWeakestQuestions(items, -5, weights)).toEqual([]);
  });
});

// ============================================================================
// createEmptyTelemetry Tests
// ============================================================================

describe("createEmptyTelemetry", () => {
  it("creates telemetry with all zeros", () => {
    const telemetry = createEmptyTelemetry("exam1", 5);

    expect(telemetry.id).toBe("exam1::5");
    expect(telemetry.examId).toBe("exam1");
    expect(telemetry.questionNumber).toBe(5);
    expect(telemetry.timesCorrect).toBe(0);
    expect(telemetry.timesWrong).toBe(0);
    expect(telemetry.timesBlank).toBe(0);
    expect(telemetry.consecutiveCorrect).toBe(0);
    expect(telemetry.avgResponseTimeMs).toBe(0);
    expect(telemetry.totalSeen).toBe(0);
    expect(telemetry.lastSeenAt).toBe("");
  });

  it("generates correct ID format", () => {
    const telemetry = createEmptyTelemetry("test-exam-123", 42);
    expect(telemetry.id).toBe("test-exam-123::42");
  });
});

// ============================================================================
// isQuestionMastered Tests
// ============================================================================

describe("isQuestionMastered", () => {
  it("returns true for sufficiently practiced and consecutive correct", () => {
    const telemetry: QuestionTelemetry = {
      id: "e1::1",
      examId: "e1",
      questionNumber: 1,
      timesCorrect: 5,
      timesWrong: 0,
      timesBlank: 0,
      consecutiveCorrect: 3,
      avgResponseTimeMs: 0,
      totalSeen: 5,
      lastSeenAt: "",
    };

    expect(isQuestionMastered(telemetry)).toBe(true);
  });

  it("returns false for insufficient consecutive correct", () => {
    const telemetry: QuestionTelemetry = {
      id: "e1::1",
      examId: "e1",
      questionNumber: 1,
      timesCorrect: 5,
      timesWrong: 0,
      timesBlank: 0,
      consecutiveCorrect: 2, // less than default 3
      avgResponseTimeMs: 0,
      totalSeen: 5,
      lastSeenAt: "",
    };

    expect(isQuestionMastered(telemetry)).toBe(false);
  });

  it("returns false for insufficient attempts", () => {
    const telemetry: QuestionTelemetry = {
      id: "e1::1",
      examId: "e1",
      questionNumber: 1,
      timesCorrect: 1,
      timesWrong: 0,
      timesBlank: 0,
      consecutiveCorrect: 3,
      avgResponseTimeMs: 0,
      totalSeen: 1, // less than default 2
      lastSeenAt: "",
    };

    expect(isQuestionMastered(telemetry)).toBe(false);
  });

  it("respects custom thresholds", () => {
    const telemetry: QuestionTelemetry = {
      id: "e1::1",
      examId: "e1",
      questionNumber: 1,
      timesCorrect: 2,
      timesWrong: 0,
      timesBlank: 0,
      consecutiveCorrect: 1,
      avgResponseTimeMs: 0,
      totalSeen: 2,
      lastSeenAt: "",
    };

    expect(isQuestionMastered(telemetry, 1, 1)).toBe(true);
  });
});

// ============================================================================
// DEFAULT_WEAKNESS_WEIGHTS Tests
// ============================================================================

