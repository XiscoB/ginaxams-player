/**
 * Category Mastery Engine — Unit Tests (Phase 6)
 *
 * Tests cover:
 * - classifyMastery: boundary conditions for all three levels
 * - computeCategoryMastery: integration with weakness + stats
 * - Edge cases: empty data, single category, multi-category questions
 */

import { describe, it, expect } from "vitest";
import {
  classifyMastery,
  computeCategoryMastery,
  DEFAULT_MASTERY_THRESHOLDS,
  type MasteryThresholds,
} from "../categoryMastery.js";
import type { Question, QuestionTelemetry } from "../types.js";
import type { WeaknessWeights } from "../weakness.js";

// ============================================================================
// Test Helpers
// ============================================================================

const defaultWeights: WeaknessWeights = {
  wrongWeight: 2,
  blankWeight: 1.2,
  recoveryWeight: 1,
  weakTimeThresholdMs: 15000,
};

const defaultThresholds: MasteryThresholds = DEFAULT_MASTERY_THRESHOLDS;

function makeQuestion(number: number, categories: string[]): Question {
  return {
    number,
    text: `Question ${number}`,
    categoria: categories,
    articulo_referencia: "Art. 1",
    feedback: {
      cita_literal: "Citation",
      explicacion_fallo: "Explanation",
    },
    answers: [
      { letter: "A", text: "A", isCorrect: true },
      { letter: "B", text: "B", isCorrect: false },
    ],
  };
}

function makeTelemetry(
  examId: string,
  questionNumber: number,
  overrides: Partial<QuestionTelemetry> = {},
): QuestionTelemetry {
  return {
    id: `${examId}_${questionNumber}`,
    examId,
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

// ============================================================================
// classifyMastery Tests
// ============================================================================

describe("classifyMastery", () => {
  it("returns 'weak' when weakness >= weakThreshold", () => {
    expect(classifyMastery(2.0, 0.6, defaultThresholds)).toBe("weak");
    expect(classifyMastery(3.0, 0.9, defaultThresholds)).toBe("weak");
  });

  it("returns 'weak' when accuracy < accuracyLow", () => {
    expect(classifyMastery(0.0, 0.3, defaultThresholds)).toBe("weak");
    expect(classifyMastery(0.1, 0.39, defaultThresholds)).toBe("weak");
  });

  it("returns 'weak' when both conditions met", () => {
    expect(classifyMastery(5.0, 0.1, defaultThresholds)).toBe("weak");
  });

  it("returns 'mastered' when weakness <= masteredThreshold AND accuracy >= accuracyHigh", () => {
    expect(classifyMastery(0.5, 0.8, defaultThresholds)).toBe("mastered");
    expect(classifyMastery(0.0, 1.0, defaultThresholds)).toBe("mastered");
    expect(classifyMastery(0.3, 0.9, defaultThresholds)).toBe("mastered");
  });

  it("returns 'learning' when neither weak nor mastered", () => {
    // weakness 1.0, accuracy 0.6 — not weak (< 2.0), not mastered (> 0.5)
    expect(classifyMastery(1.0, 0.6, defaultThresholds)).toBe("learning");
    // weakness 0.5, accuracy 0.7 — weakness ok but accuracy < 0.8
    expect(classifyMastery(0.5, 0.7, defaultThresholds)).toBe("learning");
    // weakness 0.6, accuracy 0.8 — accuracy ok but weakness > 0.5
    expect(classifyMastery(0.6, 0.8, defaultThresholds)).toBe("learning");
  });

  it("weak takes priority over mastered at boundary", () => {
    // weakness exactly at weakThreshold → weak, even if accuracy is high
    expect(classifyMastery(2.0, 0.9, defaultThresholds)).toBe("weak");
  });

  it("boundary: weakness exactly at masteredThreshold with high accuracy → mastered", () => {
    expect(classifyMastery(0.5, 0.8, defaultThresholds)).toBe("mastered");
  });

  it("boundary: accuracy exactly at accuracyLow → not weak from accuracy alone", () => {
    // accuracy = 0.4 is NOT < 0.4, so accuracy condition doesn't trigger weak
    expect(classifyMastery(0.0, 0.4, defaultThresholds)).toBe("learning");
  });

  it("boundary: accuracy exactly at accuracyHigh → mastered if weakness ok", () => {
    expect(classifyMastery(0.0, 0.8, defaultThresholds)).toBe("mastered");
  });

  it("uses custom thresholds correctly", () => {
    const custom: MasteryThresholds = {
      weakThreshold: 1.0,
      masteredThreshold: 0.2,
      accuracyLow: 0.5,
      accuracyHigh: 0.9,
    };
    expect(classifyMastery(1.0, 0.8, custom)).toBe("weak");
    expect(classifyMastery(0.2, 0.9, custom)).toBe("mastered");
    expect(classifyMastery(0.5, 0.7, custom)).toBe("learning");
  });

  it("zero weakness and zero accuracy → weak (accuracy < accuracyLow)", () => {
    expect(classifyMastery(0.0, 0.0, defaultThresholds)).toBe("weak");
  });

  it("zero weakness and perfect accuracy → mastered", () => {
    expect(classifyMastery(0.0, 1.0, defaultThresholds)).toBe("mastered");
  });
});

// ============================================================================
// DEFAULT_MASTERY_THRESHOLDS Tests
// ============================================================================

describe("DEFAULT_MASTERY_THRESHOLDS", () => {
  it("has expected default values", () => {
    expect(DEFAULT_MASTERY_THRESHOLDS.weakThreshold).toBe(2.0);
    expect(DEFAULT_MASTERY_THRESHOLDS.masteredThreshold).toBe(0.5);
    expect(DEFAULT_MASTERY_THRESHOLDS.accuracyLow).toBe(0.4);
    expect(DEFAULT_MASTERY_THRESHOLDS.accuracyHigh).toBe(0.8);
  });

  it("thresholds form a coherent range", () => {
    expect(DEFAULT_MASTERY_THRESHOLDS.masteredThreshold).toBeLessThan(
      DEFAULT_MASTERY_THRESHOLDS.weakThreshold,
    );
    expect(DEFAULT_MASTERY_THRESHOLDS.accuracyLow).toBeLessThan(
      DEFAULT_MASTERY_THRESHOLDS.accuracyHigh,
    );
  });
});

// ============================================================================
// computeCategoryMastery Tests
// ============================================================================

describe("computeCategoryMastery", () => {
  it("returns empty array for empty questions", () => {
    const result = computeCategoryMastery(
      [],
      [],
      defaultWeights,
      defaultThresholds,
    );
    expect(result).toEqual([]);
  });

  it("classifies a single category with no telemetry as 'weak' (accuracy = 0)", () => {
    const questions = [makeQuestion(1, ["Math"])];
    const result = computeCategoryMastery(
      questions,
      [],
      defaultWeights,
      defaultThresholds,
    );

    expect(result).toHaveLength(1);
    expect(result[0].category).toBe("Math");
    expect(result[0].weaknessScore).toBe(0); // no telemetry → weakness 0
    expect(result[0].accuracy).toBe(0); // no attempts → accuracy 0
    // weakness 0 < 2.0 (not weak from weakness), but accuracy 0 < 0.4 → weak
    expect(result[0].level).toBe("weak");
  });

  it("classifies a mastered category correctly", () => {
    const questions = [makeQuestion(1, ["Math"])];
    const telemetry = [
      makeTelemetry("exam1", 1, {
        timesCorrect: 10,
        timesWrong: 0,
        timesBlank: 0,
        consecutiveCorrect: 10,
        totalSeen: 10,
        avgResponseTimeMs: 5000,
        lastSeenAt: "2025-01-01T00:00:00Z",
      }),
    ];

    const result = computeCategoryMastery(
      questions,
      telemetry,
      defaultWeights,
      defaultThresholds,
    );

    expect(result).toHaveLength(1);
    expect(result[0].category).toBe("Math");
    expect(result[0].accuracy).toBe(1.0); // 10/10
    // weakness: wrong*2 + blank*1.2 - consecutive*1 = 0 + 0 - 10 = clamped to 0
    expect(result[0].weaknessScore).toBe(0);
    expect(result[0].level).toBe("mastered");
  });

  it("classifies a weak category correctly", () => {
    const questions = [makeQuestion(1, ["Math"])];
    const telemetry = [
      makeTelemetry("exam1", 1, {
        timesCorrect: 1,
        timesWrong: 5,
        timesBlank: 0,
        consecutiveCorrect: 0,
        totalSeen: 6,
        avgResponseTimeMs: 5000,
        lastSeenAt: "2025-01-01T00:00:00Z",
      }),
    ];

    const result = computeCategoryMastery(
      questions,
      telemetry,
      defaultWeights,
      defaultThresholds,
    );

    expect(result).toHaveLength(1);
    expect(result[0].category).toBe("Math");
    // accuracy: 1/6 ≈ 0.167
    expect(result[0].accuracy).toBeCloseTo(1 / 6, 5);
    // weakness: 5*2 + 0 - 0 = 10 → >= 2.0
    expect(result[0].weaknessScore).toBe(10);
    expect(result[0].level).toBe("weak");
  });

  it("classifies a learning category correctly", () => {
    const questions = [makeQuestion(1, ["Math"])];
    const telemetry = [
      makeTelemetry("exam1", 1, {
        timesCorrect: 3,
        timesWrong: 1,
        timesBlank: 0,
        consecutiveCorrect: 1,
        totalSeen: 4,
        avgResponseTimeMs: 5000,
        lastSeenAt: "2025-01-01T00:00:00Z",
      }),
    ];

    const result = computeCategoryMastery(
      questions,
      telemetry,
      defaultWeights,
      defaultThresholds,
    );

    expect(result).toHaveLength(1);
    expect(result[0].category).toBe("Math");
    // accuracy: 3/4 = 0.75 → above 0.4, below 0.8
    expect(result[0].accuracy).toBe(0.75);
    // weakness: 1*2 + 0 - 1*1 = 1 → above 0.5, below 2.0
    expect(result[0].weaknessScore).toBe(1);
    expect(result[0].level).toBe("learning");
  });

  it("handles multiple categories with different mastery levels", () => {
    const questions = [
      makeQuestion(1, ["Math"]),
      makeQuestion(2, ["Science"]),
      makeQuestion(3, ["History"]),
    ];
    const telemetry = [
      // Math: mastered
      makeTelemetry("exam1", 1, {
        timesCorrect: 10,
        timesWrong: 0,
        consecutiveCorrect: 10,
        totalSeen: 10,
        lastSeenAt: "2025-01-01T00:00:00Z",
      }),
      // Science: weak
      makeTelemetry("exam1", 2, {
        timesCorrect: 0,
        timesWrong: 5,
        consecutiveCorrect: 0,
        totalSeen: 5,
        lastSeenAt: "2025-01-01T00:00:00Z",
      }),
      // History: learning
      makeTelemetry("exam1", 3, {
        timesCorrect: 3,
        timesWrong: 1,
        consecutiveCorrect: 1,
        totalSeen: 4,
        lastSeenAt: "2025-01-01T00:00:00Z",
      }),
    ];

    const result = computeCategoryMastery(
      questions,
      telemetry,
      defaultWeights,
      defaultThresholds,
    );

    expect(result).toHaveLength(3);
    // Sorted by category ASC
    expect(result[0].category).toBe("History");
    expect(result[0].level).toBe("learning");
    expect(result[1].category).toBe("Math");
    expect(result[1].level).toBe("mastered");
    expect(result[2].category).toBe("Science");
    expect(result[2].level).toBe("weak");
  });

  it("handles multi-category questions (contributes to each category)", () => {
    const questions = [makeQuestion(1, ["Math", "Science"])];
    const telemetry = [
      makeTelemetry("exam1", 1, {
        timesCorrect: 8,
        timesWrong: 0,
        consecutiveCorrect: 8,
        totalSeen: 8,
        lastSeenAt: "2025-01-01T00:00:00Z",
      }),
    ];

    const result = computeCategoryMastery(
      questions,
      telemetry,
      defaultWeights,
      defaultThresholds,
    );

    expect(result).toHaveLength(2);
    // Both categories should have the same data since it's the same question
    expect(result[0].category).toBe("Math");
    expect(result[1].category).toBe("Science");
    expect(result[0].level).toBe(result[1].level);
    expect(result[0].accuracy).toBe(result[1].accuracy);
    expect(result[0].weaknessScore).toBe(result[1].weaknessScore);
  });

  it("output is sorted by category ASC", () => {
    const questions = [
      makeQuestion(1, ["Zebra"]),
      makeQuestion(2, ["Alpha"]),
      makeQuestion(3, ["Middle"]),
    ];

    const result = computeCategoryMastery(
      questions,
      [],
      defaultWeights,
      defaultThresholds,
    );

    expect(result.map((r) => r.category)).toEqual(["Alpha", "Middle", "Zebra"]);
  });

  it("is a pure function (does not mutate inputs)", () => {
    const questions = [makeQuestion(1, ["Math"])];
    const telemetry = [
      makeTelemetry("exam1", 1, {
        timesCorrect: 5,
        timesWrong: 2,
        consecutiveCorrect: 1,
        totalSeen: 7,
      }),
    ];

    const questionsCopy = JSON.parse(JSON.stringify(questions));
    const telemetryCopy = JSON.parse(JSON.stringify(telemetry));

    computeCategoryMastery(
      questions,
      telemetry,
      defaultWeights,
      defaultThresholds,
    );

    expect(questions).toEqual(questionsCopy);
    expect(telemetry).toEqual(telemetryCopy);
  });

  it("is deterministic (same inputs → same outputs)", () => {
    const questions = [makeQuestion(1, ["Math"]), makeQuestion(2, ["Science"])];
    const telemetry = [
      makeTelemetry("exam1", 1, {
        timesCorrect: 5,
        timesWrong: 1,
        totalSeen: 6,
      }),
      makeTelemetry("exam1", 2, {
        timesCorrect: 2,
        timesWrong: 3,
        totalSeen: 5,
      }),
    ];

    const result1 = computeCategoryMastery(
      questions,
      telemetry,
      defaultWeights,
      defaultThresholds,
    );
    const result2 = computeCategoryMastery(
      questions,
      telemetry,
      defaultWeights,
      defaultThresholds,
    );
    const result3 = computeCategoryMastery(
      questions,
      telemetry,
      defaultWeights,
      defaultThresholds,
    );

    expect(result1).toEqual(result2);
    expect(result2).toEqual(result3);
  });

  it("uses custom thresholds when provided", () => {
    const questions = [makeQuestion(1, ["Math"])];
    const telemetry = [
      makeTelemetry("exam1", 1, {
        timesCorrect: 3,
        timesWrong: 1,
        consecutiveCorrect: 1,
        totalSeen: 4,
        lastSeenAt: "2025-01-01T00:00:00Z",
      }),
    ];

    // With default thresholds: weakness=1, accuracy=0.75 → "learning"
    const defaultResult = computeCategoryMastery(
      questions,
      telemetry,
      defaultWeights,
      defaultThresholds,
    );
    expect(defaultResult[0].level).toBe("learning");

    // With custom thresholds: weakThreshold=1.0 → weakness 1.0 >= 1.0 → "weak"
    const customThresholds: MasteryThresholds = {
      weakThreshold: 1.0,
      masteredThreshold: 0.2,
      accuracyLow: 0.5,
      accuracyHigh: 0.9,
    };
    const customResult = computeCategoryMastery(
      questions,
      telemetry,
      defaultWeights,
      customThresholds,
    );
    expect(customResult[0].level).toBe("weak");
  });

  it("handles all questions unseen (weakness 0, accuracy 0)", () => {
    const questions = [makeQuestion(1, ["Math"]), makeQuestion(2, ["Math"])];

    const result = computeCategoryMastery(
      questions,
      [],
      defaultWeights,
      defaultThresholds,
    );

    expect(result).toHaveLength(1);
    expect(result[0].weaknessScore).toBe(0);
    expect(result[0].accuracy).toBe(0);
    // accuracy 0 < 0.4 → weak
    expect(result[0].level).toBe("weak");
  });
});
