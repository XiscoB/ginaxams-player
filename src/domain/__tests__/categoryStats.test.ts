/**
 * Category Performance Tracking Unit Tests (Phase 5)
 *
 * Pure domain tests for computing per-category statistics.
 * Verifies aggregation, multi-category contribution, divide-by-zero safety,
 * and deterministic ordering.
 */

import { describe, it, expect } from "vitest";
import { computeCategoryStats } from "../categoryStats.js";
import type { Question, QuestionTelemetry } from "../types.js";

// ============================================================================
// Test Fixtures
// ============================================================================

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
  timesCorrect: number,
  timesWrong: number,
  timesBlank: number = 0,
  examId: string = "exam-1",
): QuestionTelemetry {
  return {
    id: `${examId}::${questionNumber}`,
    examId,
    questionNumber,
    timesCorrect,
    timesWrong,
    timesBlank,
    consecutiveCorrect: 0,
    avgResponseTimeMs: 5000,
    totalSeen: timesCorrect + timesWrong + timesBlank,
    lastSeenAt:
      timesCorrect + timesWrong + timesBlank > 0 ? "2024-01-01T00:00:00Z" : "",
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("computeCategoryStats", () => {
  it("computes correct stats for a single category", () => {
    const questions = [
      createQuestion(1, ["Math"]),
      createQuestion(2, ["Math"]),
    ];
    // Q1: 3 correct, 2 wrong, 0 blank → attempted=5, correct=3
    // Q2: 1 correct, 0 wrong, 1 blank → attempted=2, correct=1
    const telemetry = [
      createTelemetry(1, 3, 2, 0),
      createTelemetry(2, 1, 0, 1),
    ];

    const result = computeCategoryStats(questions, telemetry);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      category: "Math",
      questionsAttempted: 7, // 5 + 2
      questionsCorrect: 4, // 3 + 1
      accuracy: 4 / 7,
    });
  });

  it("handles questions belonging to multiple categories", () => {
    const questions = [
      createQuestion(1, ["Math", "Science"]),
      createQuestion(2, ["Science"]),
    ];
    // Q1: 2 correct, 1 wrong → attempted=3, correct=2 (contributes to both)
    // Q2: 4 correct, 0 wrong → attempted=4, correct=4 (Science only)
    const telemetry = [createTelemetry(1, 2, 1), createTelemetry(2, 4, 0)];

    const result = computeCategoryStats(questions, telemetry);

    // Sorted by category ASC: Math, Science
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      category: "Math",
      questionsAttempted: 3,
      questionsCorrect: 2,
      accuracy: 2 / 3,
    });
    expect(result[1]).toEqual({
      category: "Science",
      questionsAttempted: 7, // 3 + 4
      questionsCorrect: 6, // 2 + 4
      accuracy: 6 / 7,
    });
  });

  it("returns accuracy 0 when questionsAttempted is 0 (divide-by-zero)", () => {
    const questions = [createQuestion(1, ["Untouched"])];

    const result = computeCategoryStats(questions, []);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      category: "Untouched",
      questionsAttempted: 0,
      questionsCorrect: 0,
      accuracy: 0,
    });
  });

  it("returns empty array for no questions", () => {
    const result = computeCategoryStats([], []);
    expect(result).toEqual([]);
  });

  it("handles questions with no telemetry (zero stats)", () => {
    const questions = [createQuestion(1, ["A"]), createQuestion(2, ["B"])];

    const result = computeCategoryStats(questions, []);

    expect(result).toHaveLength(2);
    for (const stat of result) {
      expect(stat.questionsAttempted).toBe(0);
      expect(stat.questionsCorrect).toBe(0);
      expect(stat.accuracy).toBe(0);
    }
  });

  it("sorts results by category name ASC", () => {
    const questions = [
      createQuestion(1, ["Zebra"]),
      createQuestion(2, ["Alpha"]),
      createQuestion(3, ["Middle"]),
    ];
    const telemetry = [
      createTelemetry(1, 1, 0),
      createTelemetry(2, 2, 0),
      createTelemetry(3, 3, 0),
    ];

    const result = computeCategoryStats(questions, telemetry);

    expect(result.map((r) => r.category)).toEqual(["Alpha", "Middle", "Zebra"]);
  });

  it("does not mutate input arrays", () => {
    const questions = [createQuestion(1, ["Cat"]), createQuestion(2, ["Dog"])];
    const telemetry = [createTelemetry(1, 1, 1), createTelemetry(2, 2, 0)];

    const questionsCopy = [...questions];
    const telemetryCopy = [...telemetry];

    computeCategoryStats(questions, telemetry);

    expect(questions).toEqual(questionsCopy);
    expect(telemetry).toEqual(telemetryCopy);
  });

  it("handles blank answers in statistics", () => {
    const questions = [createQuestion(1, ["Mixed"])];
    // 2 correct, 1 wrong, 3 blank = 6 attempted
    const telemetry = [createTelemetry(1, 2, 1, 3)];

    const result = computeCategoryStats(questions, telemetry);

    expect(result[0]).toEqual({
      category: "Mixed",
      questionsAttempted: 6,
      questionsCorrect: 2,
      accuracy: 2 / 6,
    });
  });

  it("is deterministic across multiple calls", () => {
    const questions = [
      createQuestion(1, ["A", "B"]),
      createQuestion(2, ["B", "C"]),
    ];
    const telemetry = [createTelemetry(1, 3, 1), createTelemetry(2, 1, 2)];

    const result1 = computeCategoryStats(questions, telemetry);
    const result2 = computeCategoryStats(questions, telemetry);

    expect(result1).toEqual(result2);
  });

  it("correctly computes accuracy as ratio", () => {
    const questions = [createQuestion(1, ["Precision"])];
    // 1 correct, 0 wrong → accuracy = 1/1 = 1.0
    const telemetry = [createTelemetry(1, 1, 0)];

    const result = computeCategoryStats(questions, telemetry);

    expect(result[0].accuracy).toBe(1.0);
  });
});
