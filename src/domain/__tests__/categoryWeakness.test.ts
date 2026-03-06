/**
 * Category Weakness Aggregation Unit Tests (Phase 5)
 *
 * Pure domain tests for computing per-category weakness scores.
 * Verifies averaging, multi-category contribution, sorting, and edge cases.
 */

import { describe, it, expect } from "vitest";
import { computeCategoryWeakness } from "../categoryWeakness.js";
import type { Question, QuestionTelemetry } from "../types.js";
import type { WeaknessWeights } from "../weakness.js";

// ============================================================================
// Test Fixtures
// ============================================================================

const DEFAULT_WEIGHTS: WeaknessWeights = {
  wrongWeight: 2,
  blankWeight: 1.2,
  recoveryWeight: 1,
  weakTimeThresholdMs: 15000,
};

function createQuestion(number: number, categorias: string[]): Question {
  return {
    number,
    text: `Question ${number}`,
    categoria: categorias,
    articulo_referencia: `Article ${number}`,
    feedback: {
      cita_literal: "Citation",
      explicacion_fallo: "Explanation",
    },
    answers: [
      { letter: "A", text: "Wrong", isCorrect: false },
      { letter: "B", text: "Correct", isCorrect: true },
    ],
  };
}

function createTelemetry(
  questionNumber: number,
  timesWrong: number,
  opts?: {
    timesBlank?: number;
    consecutiveCorrect?: number;
    avgResponseTimeMs?: number;
    totalSeen?: number;
    examId?: string;
  },
): QuestionTelemetry {
  const examId = opts?.examId ?? "exam-1";
  const timesBlank = opts?.timesBlank ?? 0;
  const consecutiveCorrect = opts?.consecutiveCorrect ?? 0;
  return {
    id: `${examId}::${questionNumber}`,
    examId,
    questionNumber,
    timesCorrect: 0,
    timesWrong,
    timesBlank,
    consecutiveCorrect,
    avgResponseTimeMs: opts?.avgResponseTimeMs ?? 5000,
    totalSeen: opts?.totalSeen ?? timesWrong + timesBlank,
    lastSeenAt: timesWrong + timesBlank > 0 ? "2024-01-01T00:00:00Z" : "",
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("computeCategoryWeakness", () => {
  it("computes correct average weakness per category", () => {
    const questions = [
      createQuestion(1, ["Math"]),
      createQuestion(2, ["Math"]),
    ];
    // Q1: 5 wrong → weakness = 5 * 2 = 10
    // Q2: 1 wrong → weakness = 1 * 2 = 2
    const telemetry = [createTelemetry(1, 5), createTelemetry(2, 1)];

    const result = computeCategoryWeakness(
      questions,
      telemetry,
      DEFAULT_WEIGHTS,
    );

    expect(result).toHaveLength(1);
    expect(result[0].category).toBe("Math");
    expect(result[0].score).toBe(6); // (10 + 2) / 2 = 6
  });

  it("handles questions belonging to multiple categories", () => {
    const questions = [
      createQuestion(1, ["Math", "Science"]),
      createQuestion(2, ["Science"]),
    ];
    // Q1: 3 wrong → weakness = 6 (contributes to both Math and Science)
    // Q2: 1 wrong → weakness = 2 (contributes to Science only)
    const telemetry = [createTelemetry(1, 3), createTelemetry(2, 1)];

    const result = computeCategoryWeakness(
      questions,
      telemetry,
      DEFAULT_WEIGHTS,
    );

    // Math: avg of [6] = 6
    // Science: avg of [6, 2] = 4
    // Sorted by score DESC: Math(6), Science(4)
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ category: "Math", score: 6 });
    expect(result[1]).toEqual({ category: "Science", score: 4 });
  });

  it("returns weakness 0 for questions with no telemetry", () => {
    const questions = [
      createQuestion(1, ["History"]),
      createQuestion(2, ["History"]),
    ];

    const result = computeCategoryWeakness(questions, [], DEFAULT_WEIGHTS);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ category: "History", score: 0 });
  });

  it("sorts by score DESC, then category ASC for ties", () => {
    const questions = [
      createQuestion(1, ["Alpha"]),
      createQuestion(2, ["Beta"]),
      createQuestion(3, ["Gamma"]),
    ];
    // Alpha: weakness = 4, Beta: weakness = 4, Gamma: weakness = 6
    const telemetry = [
      createTelemetry(1, 2), // weakness = 4
      createTelemetry(2, 2), // weakness = 4
      createTelemetry(3, 3), // weakness = 6
    ];

    const result = computeCategoryWeakness(
      questions,
      telemetry,
      DEFAULT_WEIGHTS,
    );

    expect(result).toHaveLength(3);
    expect(result[0].category).toBe("Gamma"); // score 6 (highest)
    expect(result[1].category).toBe("Alpha"); // score 4, "Alpha" < "Beta"
    expect(result[2].category).toBe("Beta"); // score 4, "Beta"
  });

  it("returns empty array for empty questions", () => {
    const result = computeCategoryWeakness([], [], DEFAULT_WEIGHTS);
    expect(result).toEqual([]);
  });

  it("returns empty array for questions with no categories", () => {
    // Edge case: question with empty categoria array
    const question: Question = {
      number: 1,
      text: "Q1",
      categoria: [],
      articulo_referencia: "Art 1",
      feedback: { cita_literal: "C", explicacion_fallo: "E" },
      answers: [{ letter: "A", text: "A", isCorrect: true }],
    };

    const result = computeCategoryWeakness([question], [], DEFAULT_WEIGHTS);
    expect(result).toEqual([]);
  });

  it("does not mutate input arrays", () => {
    const questions = [
      createQuestion(1, ["Math"]),
      createQuestion(2, ["Science"]),
    ];
    const telemetry = [createTelemetry(1, 3), createTelemetry(2, 1)];

    const questionsCopy = [...questions];
    const telemetryCopy = [...telemetry];

    computeCategoryWeakness(questions, telemetry, DEFAULT_WEIGHTS);

    expect(questions).toEqual(questionsCopy);
    expect(telemetry).toEqual(telemetryCopy);
  });

  it("includes time penalty in weakness calculation", () => {
    const questions = [createQuestion(1, ["Slow"])];
    // avgResponseTimeMs = 30000, threshold = 15000
    // timePenalty = (30000 - 15000) / 15000 = 1.0
    // weakness = 0 + 0 + 1.0 - 0 = 1.0
    const telemetry = [
      createTelemetry(1, 0, { avgResponseTimeMs: 30000, totalSeen: 1 }),
    ];

    const result = computeCategoryWeakness(
      questions,
      telemetry,
      DEFAULT_WEIGHTS,
    );

    expect(result).toHaveLength(1);
    expect(result[0].score).toBe(1); // time penalty only
  });

  it("applies recovery weight from consecutive correct", () => {
    const questions = [createQuestion(1, ["Recovery"])];
    // 3 wrong (weakness 6) - 2 consecutive correct (recovery 2) = 4
    const telemetry = [
      createTelemetry(1, 3, { consecutiveCorrect: 2, totalSeen: 5 }),
    ];

    const result = computeCategoryWeakness(
      questions,
      telemetry,
      DEFAULT_WEIGHTS,
    );

    expect(result).toHaveLength(1);
    expect(result[0].score).toBe(4); // 6 - 2 = 4
  });

  it("is deterministic across multiple calls", () => {
    const questions = [
      createQuestion(1, ["A", "B"]),
      createQuestion(2, ["B", "C"]),
      createQuestion(3, ["A", "C"]),
    ];
    const telemetry = [
      createTelemetry(1, 3),
      createTelemetry(2, 1),
      createTelemetry(3, 5),
    ];

    const result1 = computeCategoryWeakness(
      questions,
      telemetry,
      DEFAULT_WEIGHTS,
    );
    const result2 = computeCategoryWeakness(
      questions,
      telemetry,
      DEFAULT_WEIGHTS,
    );

    expect(result1).toEqual(result2);
  });
});
