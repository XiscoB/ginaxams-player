/**
 * Question Difficulty Unit Tests — Phase 8
 *
 * Tests for:
 * - computeDifficultyScore: raw difficulty from telemetry
 * - classifyDifficulty: threshold-based classification
 * - computeQuestionDifficulty: aggregation across questions
 * - getDifficultyMultiplier: config-driven multiplier lookup
 * - Input immutability
 * - Deterministic ordering
 */

import { describe, it, expect } from "vitest";
import {
  computeDifficultyScore,
  classifyDifficulty,
  computeQuestionDifficulty,
  getDifficultyMultiplier,
  type DifficultyAdjustmentConfig,
} from "../questionDifficulty.js";
import type { Question, QuestionTelemetry } from "../types.js";

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockQuestion(
  number: number,
  categories: string[] = ["test"],
): Question {
  return {
    number,
    text: `Question ${number}`,
    categoria: categories,
    articulo_referencia: `Article ${number}`,
    feedback: {
      cita_literal: "Test citation",
      explicacion_fallo: "Test explanation",
    },
    answers: [
      { letter: "A", text: "Wrong", isCorrect: false },
      { letter: "B", text: "Correct", isCorrect: true },
    ],
  };
}

function createMockTelemetry(
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

const DEFAULT_DIFFICULTY_CONFIG: DifficultyAdjustmentConfig = {
  easyBoost: 1.2,
  mediumBoost: 1.0,
  hardPenalty: 0.85,
};

// ============================================================================
// computeDifficultyScore
// ============================================================================

describe("computeDifficultyScore", () => {
  it("returns 0 when totalSeen is 0 (no telemetry)", () => {
    const telemetry = createMockTelemetry(1, { totalSeen: 0 });
    expect(computeDifficultyScore(telemetry)).toBe(0);
  });

  it("returns 0 when always correct", () => {
    const telemetry = createMockTelemetry(1, {
      timesCorrect: 10,
      timesWrong: 0,
      timesBlank: 0,
      totalSeen: 10,
    });
    expect(computeDifficultyScore(telemetry)).toBe(0);
  });

  it("returns 1 when always wrong", () => {
    const telemetry = createMockTelemetry(1, {
      timesCorrect: 0,
      timesWrong: 10,
      timesBlank: 0,
      totalSeen: 10,
    });
    expect(computeDifficultyScore(telemetry)).toBe(1);
  });

  it("returns 1 when always blank", () => {
    const telemetry = createMockTelemetry(1, {
      timesCorrect: 0,
      timesWrong: 0,
      timesBlank: 5,
      totalSeen: 5,
    });
    expect(computeDifficultyScore(telemetry)).toBe(1);
  });

  it("returns correct ratio for mixed answers", () => {
    const telemetry = createMockTelemetry(1, {
      timesCorrect: 6,
      timesWrong: 3,
      timesBlank: 1,
      totalSeen: 10,
    });
    // (3 + 1) / 10 = 0.4
    expect(computeDifficultyScore(telemetry)).toBeCloseTo(0.4);
  });

  it("returns correct ratio for mostly wrong", () => {
    const telemetry = createMockTelemetry(1, {
      timesCorrect: 2,
      timesWrong: 5,
      timesBlank: 3,
      totalSeen: 10,
    });
    // (5 + 3) / 10 = 0.8
    expect(computeDifficultyScore(telemetry)).toBeCloseTo(0.8);
  });

  it("clamps result to [0, 1]", () => {
    const telemetry = createMockTelemetry(1, {
      timesCorrect: 0,
      timesWrong: 100,
      timesBlank: 100,
      totalSeen: 100,
    });
    // (100+100)/100 = 2.0 → clamped to 1
    expect(computeDifficultyScore(telemetry)).toBe(1);
  });
});

// ============================================================================
// classifyDifficulty
// ============================================================================

describe("classifyDifficulty", () => {
  it("classifies 0 as easy", () => {
    expect(classifyDifficulty(0)).toBe("easy");
  });

  it("classifies 0.29 as easy", () => {
    expect(classifyDifficulty(0.29)).toBe("easy");
  });

  it("classifies 0.3 as medium", () => {
    expect(classifyDifficulty(0.3)).toBe("medium");
  });

  it("classifies 0.5 as medium", () => {
    expect(classifyDifficulty(0.5)).toBe("medium");
  });

  it("classifies 0.59 as medium", () => {
    expect(classifyDifficulty(0.59)).toBe("medium");
  });

  it("classifies 0.6 as hard", () => {
    expect(classifyDifficulty(0.6)).toBe("hard");
  });

  it("classifies 0.8 as hard", () => {
    expect(classifyDifficulty(0.8)).toBe("hard");
  });

  it("classifies 1.0 as hard", () => {
    expect(classifyDifficulty(1.0)).toBe("hard");
  });
});

// ============================================================================
// computeQuestionDifficulty
// ============================================================================

describe("computeQuestionDifficulty", () => {
  it("returns difficulty 0 for questions without telemetry", () => {
    const questions = [createMockQuestion(1), createMockQuestion(2)];
    const result = computeQuestionDifficulty(questions, []);

    expect(result).toHaveLength(2);
    expect(result[0].difficultyScore).toBe(0);
    expect(result[0].difficultyLevel).toBe("easy");
    expect(result[1].difficultyScore).toBe(0);
    expect(result[1].difficultyLevel).toBe("easy");
  });

  it("computes correct difficulty with telemetry", () => {
    const questions = [
      createMockQuestion(1),
      createMockQuestion(2),
      createMockQuestion(3),
    ];
    const telemetry = [
      createMockTelemetry(1, {
        timesCorrect: 10,
        timesWrong: 0,
        timesBlank: 0,
        totalSeen: 10,
      }),
      createMockTelemetry(2, {
        timesCorrect: 5,
        timesWrong: 3,
        timesBlank: 2,
        totalSeen: 10,
      }),
      createMockTelemetry(3, {
        timesCorrect: 1,
        timesWrong: 7,
        timesBlank: 2,
        totalSeen: 10,
      }),
    ];

    const result = computeQuestionDifficulty(questions, telemetry);

    // Q1: (0+0)/10 = 0.0 → easy
    expect(result[0].questionNumber).toBe(1);
    expect(result[0].difficultyScore).toBeCloseTo(0);
    expect(result[0].difficultyLevel).toBe("easy");

    // Q2: (3+2)/10 = 0.5 → medium
    expect(result[1].questionNumber).toBe(2);
    expect(result[1].difficultyScore).toBeCloseTo(0.5);
    expect(result[1].difficultyLevel).toBe("medium");

    // Q3: (7+2)/10 = 0.9 → hard
    expect(result[2].questionNumber).toBe(3);
    expect(result[2].difficultyScore).toBeCloseTo(0.9);
    expect(result[2].difficultyLevel).toBe("hard");
  });

  it("returns deterministic ordering by questionNumber ASC", () => {
    const questions = [
      createMockQuestion(3),
      createMockQuestion(1),
      createMockQuestion(2),
    ];

    const result = computeQuestionDifficulty(questions, []);

    expect(result[0].questionNumber).toBe(1);
    expect(result[1].questionNumber).toBe(2);
    expect(result[2].questionNumber).toBe(3);
  });

  it("does not mutate input questions", () => {
    const questions = [createMockQuestion(1), createMockQuestion(2)];
    const original = JSON.stringify(questions);

    computeQuestionDifficulty(questions, []);

    expect(JSON.stringify(questions)).toBe(original);
  });

  it("does not mutate input telemetry", () => {
    const telemetry = [
      createMockTelemetry(1, {
        timesWrong: 5,
        totalSeen: 10,
      }),
    ];
    const original = JSON.stringify(telemetry);

    computeQuestionDifficulty([createMockQuestion(1)], telemetry);

    expect(JSON.stringify(telemetry)).toBe(original);
  });

  it("handles multi-category questions (unaffected by categories)", () => {
    const questions = [createMockQuestion(1, ["cat-a", "cat-b", "cat-c"])];
    const telemetry = [
      createMockTelemetry(1, {
        timesCorrect: 3,
        timesWrong: 4,
        timesBlank: 3,
        totalSeen: 10,
      }),
    ];

    const result = computeQuestionDifficulty(questions, telemetry);

    // (4+3)/10 = 0.7 → hard, regardless of categories
    expect(result[0].difficultyScore).toBeCloseTo(0.7);
    expect(result[0].difficultyLevel).toBe("hard");
  });

  it("handles partial telemetry (only some questions have data)", () => {
    const questions = [
      createMockQuestion(1),
      createMockQuestion(2),
      createMockQuestion(3),
    ];
    const telemetry = [
      createMockTelemetry(2, {
        timesCorrect: 2,
        timesWrong: 8,
        totalSeen: 10,
      }),
    ];

    const result = computeQuestionDifficulty(questions, telemetry);

    expect(result[0].questionNumber).toBe(1);
    expect(result[0].difficultyScore).toBe(0); // No telemetry
    expect(result[1].questionNumber).toBe(2);
    expect(result[1].difficultyScore).toBeCloseTo(0.8); // Has telemetry
    expect(result[2].questionNumber).toBe(3);
    expect(result[2].difficultyScore).toBe(0); // No telemetry
  });
});

// ============================================================================
// getDifficultyMultiplier
// ============================================================================

describe("getDifficultyMultiplier", () => {
  it("returns easyBoost for easy level", () => {
    expect(getDifficultyMultiplier("easy", DEFAULT_DIFFICULTY_CONFIG)).toBe(
      1.2,
    );
  });

  it("returns mediumBoost for medium level", () => {
    expect(getDifficultyMultiplier("medium", DEFAULT_DIFFICULTY_CONFIG)).toBe(
      1.0,
    );
  });

  it("returns hardPenalty for hard level", () => {
    expect(getDifficultyMultiplier("hard", DEFAULT_DIFFICULTY_CONFIG)).toBe(
      0.85,
    );
  });

  it("uses injected config values, not hardcoded defaults", () => {
    const custom: DifficultyAdjustmentConfig = {
      easyBoost: 2.0,
      mediumBoost: 1.5,
      hardPenalty: 0.5,
    };

    expect(getDifficultyMultiplier("easy", custom)).toBe(2.0);
    expect(getDifficultyMultiplier("medium", custom)).toBe(1.5);
    expect(getDifficultyMultiplier("hard", custom)).toBe(0.5);
  });
});
