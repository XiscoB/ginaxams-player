/**
 * Exam Readiness Estimation — Unit Tests (Phase 9)
 *
 * Tests cover:
 * - computeAvgCategoryMastery: mastery ratio calculation
 * - computeRecentSimulacroAccuracy: recent simulacro accuracy
 * - computeWeaknessRecoveryRate: recovery rate from telemetry
 * - classifyReadiness: threshold-based classification
 * - computeExamReadiness: full integration
 * - Edge cases: empty data, no attempts, extreme values
 * - Input immutability
 */

import { describe, it, expect } from "vitest";
import {
  computeAvgCategoryMastery,
  computeRecentSimulacroAccuracy,
  computeWeaknessRecoveryRate,
  classifyReadiness,
  computeExamReadiness,
  type ReadinessConfig,
} from "../examReadiness.js";
import type {
  Attempt,
  QuestionTelemetry,
  CategoryMastery,
  SimulacroAttempt,
} from "../types.js";

// ============================================================================
// Test Fixtures
// ============================================================================

const defaultConfig: ReadinessConfig = {
  simulacroWindow: 5,
};

function makeMastery(
  category: string,
  level: "weak" | "learning" | "mastered",
): CategoryMastery {
  return {
    category,
    weaknessScore: level === "weak" ? 3.0 : level === "learning" ? 1.0 : 0.2,
    accuracy: level === "mastered" ? 0.9 : level === "learning" ? 0.6 : 0.2,
    level,
  };
}

function makeTelemetry(
  questionNumber: number,
  overrides: Partial<QuestionTelemetry> = {},
): QuestionTelemetry {
  return {
    id: `exam-1::${questionNumber}`,
    examId: "exam-1",
    questionNumber,
    timesCorrect: 0,
    timesWrong: 0,
    timesBlank: 0,
    consecutiveCorrect: 0,
    avgResponseTimeMs: 5000,
    totalSeen: 0,
    lastSeenAt: "",
    ...overrides,
  };
}

function makeSimulacroAttempt(
  percentage: number,
  createdAt: string,
): SimulacroAttempt {
  const correct = percentage;
  const total = 100;
  return {
    id: crypto.randomUUID(),
    type: "simulacro",
    createdAt,
    sourceExamIds: ["exam-1"],
    config: {
      questionCount: total,
      timeLimitMs: 3600000,
      penalty: 0.25,
      reward: 1,
      examWeights: { "exam-1": 1 },
    },
    result: {
      correct,
      wrong: total - correct,
      blank: 0,
      score: correct - (total - correct) * 0.25,
      percentage,
    },
  };
}

function makeFreeAttempt(createdAt: string): Attempt {
  return {
    id: crypto.randomUUID(),
    type: "free",
    createdAt,
    sourceExamIds: ["exam-1"],
    config: {},
  };
}

// ============================================================================
// computeAvgCategoryMastery Tests
// ============================================================================

describe("computeAvgCategoryMastery", () => {
  it("returns 0 for empty array", () => {
    expect(computeAvgCategoryMastery([])).toBe(0);
  });

  it("returns 1.0 when all categories mastered", () => {
    const mastery = [
      makeMastery("math", "mastered"),
      makeMastery("science", "mastered"),
    ];
    expect(computeAvgCategoryMastery(mastery)).toBe(1.0);
  });

  it("returns 0.0 when all categories weak", () => {
    const mastery = [
      makeMastery("math", "weak"),
      makeMastery("science", "weak"),
    ];
    expect(computeAvgCategoryMastery(mastery)).toBe(0.0);
  });

  it("returns 0.5 when all categories learning", () => {
    const mastery = [
      makeMastery("math", "learning"),
      makeMastery("science", "learning"),
    ];
    expect(computeAvgCategoryMastery(mastery)).toBe(0.5);
  });

  it("averages mixed mastery levels", () => {
    const mastery = [
      makeMastery("math", "mastered"), // 1.0
      makeMastery("science", "weak"), // 0.0
      makeMastery("history", "learning"), // 0.5
    ];
    expect(computeAvgCategoryMastery(mastery)).toBeCloseTo(0.5); // (1 + 0 + 0.5) / 3
  });
});

// ============================================================================
// computeRecentSimulacroAccuracy Tests
// ============================================================================

describe("computeRecentSimulacroAccuracy", () => {
  it("returns 0 for empty attempts", () => {
    expect(computeRecentSimulacroAccuracy([], 5)).toBe(0);
  });

  it("returns 0 when no simulacro attempts exist", () => {
    const attempts: Attempt[] = [
      makeFreeAttempt("2024-01-01T00:00:00Z"),
      makeFreeAttempt("2024-01-02T00:00:00Z"),
    ];
    expect(computeRecentSimulacroAccuracy(attempts, 5)).toBe(0);
  });

  it("ignores simulacro attempts without results", () => {
    const attempt: SimulacroAttempt = {
      id: "no-result",
      type: "simulacro",
      createdAt: "2024-01-01T00:00:00Z",
      sourceExamIds: ["exam-1"],
      config: {
        questionCount: 10,
        timeLimitMs: 3600000,
        penalty: 0.25,
        reward: 1,
        examWeights: { "exam-1": 1 },
      },
      // No result
    };
    expect(computeRecentSimulacroAccuracy([attempt], 5)).toBe(0);
  });

  it("uses last N simulacros sorted by date", () => {
    const attempts = [
      makeSimulacroAttempt(60, "2024-01-01T00:00:00Z"), // oldest, should be excluded
      makeSimulacroAttempt(70, "2024-01-02T00:00:00Z"),
      makeSimulacroAttempt(80, "2024-01-03T00:00:00Z"),
      makeSimulacroAttempt(90, "2024-01-04T00:00:00Z"),
    ];
    // Window of 3: should use 70, 80, 90
    const accuracy = computeRecentSimulacroAccuracy(attempts, 3);
    expect(accuracy).toBeCloseTo(0.8); // (70 + 80 + 90) / (3 × 100)
  });

  it("returns perfect accuracy for 100% simulacros", () => {
    const attempts = [makeSimulacroAttempt(100, "2024-01-01T00:00:00Z")];
    expect(computeRecentSimulacroAccuracy(attempts, 5)).toBe(1.0);
  });

  it("handles fewer attempts than window", () => {
    const attempts = [makeSimulacroAttempt(50, "2024-01-01T00:00:00Z")];
    expect(computeRecentSimulacroAccuracy(attempts, 5)).toBe(0.5);
  });

  it("ignores non-simulacro attempts", () => {
    const attempts: Attempt[] = [
      makeFreeAttempt("2024-01-01T00:00:00Z"),
      makeSimulacroAttempt(80, "2024-01-02T00:00:00Z"),
      makeFreeAttempt("2024-01-03T00:00:00Z"),
    ];
    expect(computeRecentSimulacroAccuracy(attempts, 5)).toBe(0.8);
  });
});

// ============================================================================
// computeWeaknessRecoveryRate Tests
// ============================================================================

describe("computeWeaknessRecoveryRate", () => {
  it("returns 0 for empty telemetry", () => {
    expect(computeWeaknessRecoveryRate([])).toBe(0);
  });

  it("returns 0 when no questions have been seen", () => {
    const telemetry = [makeTelemetry(1), makeTelemetry(2)];
    expect(computeWeaknessRecoveryRate(telemetry)).toBe(0);
  });

  it("returns 1.0 when all seen have 3+ consecutiveCorrect", () => {
    const telemetry = [
      makeTelemetry(1, { totalSeen: 5, consecutiveCorrect: 3 }),
      makeTelemetry(2, { totalSeen: 5, consecutiveCorrect: 5 }),
    ];
    expect(computeWeaknessRecoveryRate(telemetry)).toBe(1.0);
  });

  it("returns 0 when all seen have 0 consecutiveCorrect", () => {
    const telemetry = [
      makeTelemetry(1, { totalSeen: 5, consecutiveCorrect: 0 }),
      makeTelemetry(2, { totalSeen: 5, consecutiveCorrect: 0 }),
    ];
    expect(computeWeaknessRecoveryRate(telemetry)).toBe(0);
  });

  it("computes partial recovery correctly", () => {
    const telemetry = [
      makeTelemetry(1, { totalSeen: 5, consecutiveCorrect: 1 }), // 1/3
      makeTelemetry(2, { totalSeen: 5, consecutiveCorrect: 2 }), // 2/3
    ];
    const expected = (1 / 3 + 2 / 3) / 2; // 0.5
    expect(computeWeaknessRecoveryRate(telemetry)).toBeCloseTo(expected);
  });

  it("ignores unseen questions", () => {
    const telemetry = [
      makeTelemetry(1, { totalSeen: 0, consecutiveCorrect: 0 }),
      makeTelemetry(2, { totalSeen: 5, consecutiveCorrect: 3 }),
    ];
    expect(computeWeaknessRecoveryRate(telemetry)).toBe(1.0);
  });
});

// ============================================================================
// classifyReadiness Tests
// ============================================================================

describe("classifyReadiness", () => {
  it("returns not_ready for scores [0, 40)", () => {
    expect(classifyReadiness(0)).toBe("not_ready");
    expect(classifyReadiness(20)).toBe("not_ready");
    expect(classifyReadiness(39.9)).toBe("not_ready");
  });

  it("returns almost_ready for scores [40, 60)", () => {
    expect(classifyReadiness(40)).toBe("almost_ready");
    expect(classifyReadiness(50)).toBe("almost_ready");
    expect(classifyReadiness(59.9)).toBe("almost_ready");
  });

  it("returns ready for scores [60, 80)", () => {
    expect(classifyReadiness(60)).toBe("ready");
    expect(classifyReadiness(70)).toBe("ready");
    expect(classifyReadiness(79.9)).toBe("ready");
  });

  it("returns exam_ready for scores [80, 100]", () => {
    expect(classifyReadiness(80)).toBe("exam_ready");
    expect(classifyReadiness(90)).toBe("exam_ready");
    expect(classifyReadiness(100)).toBe("exam_ready");
  });
});

// ============================================================================
// computeExamReadiness Integration Tests
// ============================================================================

describe("computeExamReadiness", () => {
  it("returns low score with no data", () => {
    const result = computeExamReadiness([], [], [], defaultConfig);
    expect(result.readinessScore).toBe(0);
    expect(result.readinessLevel).toBe("not_ready");
  });

  it("returns high score with all mastered + high simulacro + full recovery", () => {
    const mastery = [
      makeMastery("math", "mastered"),
      makeMastery("science", "mastered"),
    ];
    const attempts = [
      makeSimulacroAttempt(95, "2024-01-01T00:00:00Z"),
      makeSimulacroAttempt(90, "2024-01-02T00:00:00Z"),
    ];
    const telemetry = [
      makeTelemetry(1, { totalSeen: 10, consecutiveCorrect: 5 }),
      makeTelemetry(2, { totalSeen: 10, consecutiveCorrect: 4 }),
    ];

    const result = computeExamReadiness(
      mastery,
      attempts,
      telemetry,
      defaultConfig,
    );

    // avgMastery = 1.0
    // simulacroAccuracy = (95 + 90) / (2 × 100) = 0.925
    // recovery = (1 + 1) / 2 = 1.0
    // score = 1.0 × 40 + 0.925 × 40 + 1.0 × 20 = 40 + 37 + 20 = 97
    expect(result.readinessScore).toBe(97);
    expect(result.readinessLevel).toBe("exam_ready");
  });

  it("category mastery influences readiness", () => {
    const weakMastery = [
      makeMastery("math", "weak"),
      makeMastery("science", "weak"),
    ];
    const strongMastery = [
      makeMastery("math", "mastered"),
      makeMastery("science", "mastered"),
    ];

    const weakResult = computeExamReadiness(weakMastery, [], [], defaultConfig);
    const strongResult = computeExamReadiness(
      strongMastery,
      [],
      [],
      defaultConfig,
    );

    expect(strongResult.readinessScore).toBeGreaterThan(
      weakResult.readinessScore,
    );
  });

  it("no simulacro attempts → only mastery and recovery contribute", () => {
    const mastery = [makeMastery("math", "mastered")];
    const telemetry = [
      makeTelemetry(1, { totalSeen: 10, consecutiveCorrect: 3 }),
    ];

    const result = computeExamReadiness(mastery, [], telemetry, defaultConfig);

    // avgMastery = 1.0
    // simulacroAccuracy = 0
    // recovery = 1.0
    // score = 1.0 × 40 + 0 × 40 + 1.0 × 20 = 60
    expect(result.readinessScore).toBe(60);
    expect(result.readinessLevel).toBe("ready");
  });

  it("clamps result to [0, 100]", () => {
    // Even with all perfect signals, score shouldn't exceed 100
    const mastery = [makeMastery("math", "mastered")];
    const attempts = [makeSimulacroAttempt(100, "2024-01-01T00:00:00Z")];
    const telemetry = [
      makeTelemetry(1, { totalSeen: 10, consecutiveCorrect: 10 }),
    ];

    const result = computeExamReadiness(
      mastery,
      attempts,
      telemetry,
      defaultConfig,
    );

    expect(result.readinessScore).toBeLessThanOrEqual(100);
    expect(result.readinessScore).toBeGreaterThanOrEqual(0);
  });

  it("ignores free and review attempts for simulacro accuracy", () => {
    const mastery = [makeMastery("math", "learning")];
    const attempts: Attempt[] = [
      makeFreeAttempt("2024-01-01T00:00:00Z"),
      {
        id: "review-1",
        type: "review",
        createdAt: "2024-01-02T00:00:00Z",
        sourceExamIds: ["exam-1"],
        config: {
          questionCount: 10,
          weights: {
            wrongWeight: 2,
            blankWeight: 1.2,
            recoveryWeight: 1,
            weakTimeThresholdMs: 15000,
          },
        },
        result: {
          correct: 9,
          wrong: 1,
          blank: 0,
          score: 8.75,
          percentage: 90,
        },
      },
    ];

    const result = computeExamReadiness(mastery, attempts, [], defaultConfig);

    // simulacro accuracy should be 0 (no simulacro attempts)
    // avgMastery = 0.5, recovery = 0
    // score = 0.5 × 40 + 0 + 0 = 20
    expect(result.readinessScore).toBe(20);
    expect(result.readinessLevel).toBe("not_ready");
  });

  it("does not mutate inputs", () => {
    const mastery = [makeMastery("math", "mastered")];
    const attempts = [makeSimulacroAttempt(80, "2024-01-01T00:00:00Z")];
    const telemetry = [
      makeTelemetry(1, { totalSeen: 5, consecutiveCorrect: 2 }),
    ];

    const masteryCopy = JSON.parse(JSON.stringify(mastery));
    const attemptsCopy = JSON.parse(JSON.stringify(attempts));
    const telemetryCopy = JSON.parse(JSON.stringify(telemetry));

    computeExamReadiness(mastery, attempts, telemetry, defaultConfig);

    expect(mastery).toEqual(masteryCopy);
    expect(attempts).toEqual(attemptsCopy);
    expect(telemetry).toEqual(telemetryCopy);
  });

  it("respects simulacroWindow config", () => {
    const mastery: CategoryMastery[] = [];
    const attempts = [
      makeSimulacroAttempt(50, "2024-01-01T00:00:00Z"),
      makeSimulacroAttempt(60, "2024-01-02T00:00:00Z"),
      makeSimulacroAttempt(70, "2024-01-03T00:00:00Z"),
      makeSimulacroAttempt(80, "2024-01-04T00:00:00Z"),
      makeSimulacroAttempt(90, "2024-01-05T00:00:00Z"),
    ];

    // Window of 2: only last 2 (80, 90)
    const config2: ReadinessConfig = { simulacroWindow: 2 };
    const result2 = computeExamReadiness(mastery, attempts, [], config2);

    // Window of 5: all 5
    const config5: ReadinessConfig = { simulacroWindow: 5 };
    const result5 = computeExamReadiness(mastery, attempts, [], config5);

    // Window of 2 → avg = (80+90)/200 = 0.85 → 0.85 * 40 = 34
    // Window of 5 → avg = (50+60+70+80+90)/500 = 0.70 → 0.70 * 40 = 28
    expect(result2.readinessScore).toBeGreaterThan(result5.readinessScore);
  });
});
