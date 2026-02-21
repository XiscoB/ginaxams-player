/**
 * Review Selection Unit Tests
 *
 * Pure domain tests for deterministic adaptive question selection.
 * Verifies weakness-based sorting, tie-breaking, and fallback logic.
 */

import { describe, it, expect } from "vitest";
import {
  generateReviewQuestions,
  sortByLastSeen,
  selectReviewQuestions,
  type ReviewQuestion,
} from "../reviewSelection.js";
import type { Question, QuestionTelemetry } from "../types.js";

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockQuestion(number: number): Question {
  return {
    number,
    text: `Question ${number}`,
    categoria: ["test"],
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
  timesWrong: number,
  timesBlank: number,
  consecutiveCorrect: number,
  lastSeenAt: string,
  examId: string = "exam-1"
): QuestionTelemetry {
  return {
    id: `${examId}::${questionNumber}`,
    examId,
    questionNumber,
    timesCorrect: 0,
    timesWrong,
    timesBlank,
    consecutiveCorrect,
    avgResponseTimeMs: 5000,
    totalSeen: timesWrong + timesBlank,
    lastSeenAt,
  };
}

const DEFAULT_WEIGHTS = {
  wrongWeight: 2,
  blankWeight: 1.2,
  recoveryWeight: 1,
  weakTimeThresholdMs: 15000,
};

// ============================================================================
// Test Suite
// ============================================================================

describe("Review Selection", () => {
  describe("generateReviewQuestions", () => {
    it("should sort by weakness DESC", () => {
      const questions = [createMockQuestion(1), createMockQuestion(2), createMockQuestion(3)];
      const telemetry = [
        createMockTelemetry(1, 5, 0, 0, "2024-01-01T00:00:00Z"), // weakness = 10
        createMockTelemetry(2, 1, 0, 0, "2024-01-01T00:00:00Z"), // weakness = 2
        createMockTelemetry(3, 3, 0, 0, "2024-01-01T00:00:00Z"), // weakness = 6
      ];

      const result = generateReviewQuestions(questions, telemetry, 10, DEFAULT_WEIGHTS);

      expect(result[0].question.number).toBe(1); // Highest weakness (10)
      expect(result[1].question.number).toBe(3); // Medium weakness (6)
      expect(result[2].question.number).toBe(2); // Lowest weakness (2)
    });

    it("should tie-break by lastSeenAt ASC (older first)", () => {
      const questions = [createMockQuestion(1), createMockQuestion(2)];
      const telemetry = [
        createMockTelemetry(1, 2, 0, 0, "2024-01-03T00:00:00Z"), // weakness = 4, seen later
        createMockTelemetry(2, 2, 0, 0, "2024-01-01T00:00:00Z"), // weakness = 4, seen earlier
      ];

      const result = generateReviewQuestions(questions, telemetry, 10, DEFAULT_WEIGHTS);

      // Equal weakness (4), so tie-break by lastSeenAt (older first)
      expect(result[0].question.number).toBe(2); // Seen 2024-01-01 (older)
      expect(result[1].question.number).toBe(1); // Seen 2024-01-03 (newer)
    });

    it("should tie-break by question.number ASC", () => {
      const questions = [createMockQuestion(2), createMockQuestion(1)];
      const telemetry = [
        createMockTelemetry(2, 2, 0, 0, "2024-01-01T00:00:00Z"), // weakness = 4
        createMockTelemetry(1, 2, 0, 0, "2024-01-01T00:00:00Z"), // weakness = 4, same date
      ];

      const result = generateReviewQuestions(questions, telemetry, 10, DEFAULT_WEIGHTS);

      // Equal weakness and lastSeenAt, so tie-break by question.number
      expect(result[0].question.number).toBe(1); // Lower number
      expect(result[1].question.number).toBe(2); // Higher number
    });

    it("should prioritize never-seen questions (empty lastSeenAt)", () => {
      const questions = [createMockQuestion(1), createMockQuestion(2)];
      const telemetry = [
        createMockTelemetry(1, 0, 0, 0, "2024-01-01T00:00:00Z"), // Seen before
        { ...createMockTelemetry(2, 0, 0, 0, ""), id: "exam-1::2" }, // Never seen (empty)
      ];

      const result = generateReviewQuestions(questions, telemetry, 10, DEFAULT_WEIGHTS);

      // Never seen (empty lastSeenAt) should come first in tie-break
      expect(result[0].question.number).toBe(2);
      expect(result[1].question.number).toBe(1);
    });

    it("should enforce review question count limit", () => {
      const questions = Array.from({ length: 10 }, (_, i) => createMockQuestion(i + 1));
      const telemetry = questions.map((q, i) =>
        createMockTelemetry(q.number, 10 - i, 0, 0, "2024-01-01T00:00:00Z")
      );

      const result = generateReviewQuestions(questions, telemetry, 5, DEFAULT_WEIGHTS);

      expect(result).toHaveLength(5);
      // Should get the 5 highest weakness questions
      expect(result[0].question.number).toBe(1); // weakness = 20
      expect(result[4].question.number).toBe(5); // weakness = 12
    });

    it("should handle empty telemetry (all questions new)", () => {
      const questions = [createMockQuestion(1), createMockQuestion(2), createMockQuestion(3)];

      const result = generateReviewQuestions(questions, [], 10, DEFAULT_WEIGHTS);

      expect(result).toHaveLength(3);
      // All have weakness 0, so sorted by question.number
      expect(result[0].question.number).toBe(1);
      expect(result[1].question.number).toBe(2);
      expect(result[2].question.number).toBe(3);
    });

    it("should not mutate input telemetry", () => {
      const questions = [createMockQuestion(1)];
      const telemetry = [createMockTelemetry(1, 5, 0, 0, "2024-01-01T00:00:00Z")];
      const original = JSON.stringify(telemetry);

      generateReviewQuestions(questions, telemetry, 10, DEFAULT_WEIGHTS);

      expect(JSON.stringify(telemetry)).toBe(original);
    });

    it("should mark isWeaknessBased correctly", () => {
      const questions = Array.from({ length: 5 }, (_, i) => createMockQuestion(i + 1));
      const telemetry = questions.map((q) =>
        createMockTelemetry(q.number, 1, 0, 0, "2024-01-01T00:00:00Z")
      );

      const result = generateReviewQuestions(questions, telemetry, 3, DEFAULT_WEIGHTS);

      expect(result).toHaveLength(3);
      expect(result.every((r) => r.isWeaknessBased)).toBe(true);
    });
  });

  describe("sortByLastSeen", () => {
    it("should sort by lastSeenAt ASC", () => {
      const items: ReviewQuestion[] = [
        {
          question: createMockQuestion(1),
          telemetry: createMockTelemetry(1, 0, 0, 0, "2024-01-03T00:00:00Z"),
          weakness: 0,
          isWeaknessBased: false,
        },
        {
          question: createMockQuestion(2),
          telemetry: createMockTelemetry(2, 0, 0, 0, "2024-01-01T00:00:00Z"),
          weakness: 0,
          isWeaknessBased: false,
        },
      ];

      const result = sortByLastSeen(items);

      expect(result[0].question.number).toBe(2); // Earlier date
      expect(result[1].question.number).toBe(1); // Later date
    });

    it("should prioritize empty lastSeenAt (never seen)", () => {
      const items: ReviewQuestion[] = [
        {
          question: createMockQuestion(1),
          telemetry: createMockTelemetry(1, 0, 0, 0, "2024-01-01T00:00:00Z"),
          weakness: 0,
          isWeaknessBased: false,
        },
        {
          question: createMockQuestion(2),
          telemetry: { ...createMockTelemetry(2, 0, 0, 0, ""), id: "exam-1::2" },
          weakness: 0,
          isWeaknessBased: false,
        },
      ];

      const result = sortByLastSeen(items);

      expect(result[0].question.number).toBe(2); // Never seen
      expect(result[1].question.number).toBe(1); // Seen before
    });

    it("should tie-break by question.number ASC", () => {
      const items: ReviewQuestion[] = [
        {
          question: createMockQuestion(2),
          telemetry: createMockTelemetry(2, 0, 0, 0, "2024-01-01T00:00:00Z"),
          weakness: 0,
          isWeaknessBased: false,
        },
        {
          question: createMockQuestion(1),
          telemetry: createMockTelemetry(1, 0, 0, 0, "2024-01-01T00:00:00Z"),
          weakness: 0,
          isWeaknessBased: false,
        },
      ];

      const result = sortByLastSeen(items);

      expect(result[0].question.number).toBe(1); // Lower number
      expect(result[1].question.number).toBe(2); // Higher number
    });
  });

  describe("selectReviewQuestions", () => {
    it("should return exactly count questions when enough exist", () => {
      const questions = Array.from({ length: 10 }, (_, i) => createMockQuestion(i + 1));
      const telemetry = questions.map((q) =>
        createMockTelemetry(q.number, 1, 0, 0, "2024-01-01T00:00:00Z")
      );

      const result = selectReviewQuestions(questions, telemetry, 5, DEFAULT_WEIGHTS);

      expect(result).toHaveLength(5);
    });

    it("should return all questions when fewer than count", () => {
      const questions = [createMockQuestion(1), createMockQuestion(2)];
      const telemetry = questions.map((q) =>
        createMockTelemetry(q.number, 1, 0, 0, "2024-01-01T00:00:00Z")
      );

      const result = selectReviewQuestions(questions, telemetry, 10, DEFAULT_WEIGHTS);

      expect(result).toHaveLength(2);
    });

    it("should not include duplicates", () => {
      const questions = Array.from({ length: 5 }, (_, i) => createMockQuestion(i + 1));
      const telemetry = questions.map((q) =>
        createMockTelemetry(q.number, 1, 0, 0, "2024-01-01T00:00:00Z")
      );

      const result = selectReviewQuestions(questions, telemetry, 5, DEFAULT_WEIGHTS);

      const numbers = result.map((r) => r.question.number);
      const uniqueNumbers = new Set(numbers);
      expect(uniqueNumbers.size).toBe(numbers.length);
    });

    it("should be deterministic with identical inputs", () => {
      const questions = Array.from({ length: 10 }, (_, i) => createMockQuestion(i + 1));
      const telemetry = questions.map((q, i) =>
        createMockTelemetry(q.number, i % 3, i % 2, 0, `2024-01-0${(i % 9) + 1}T00:00:00Z`)
      );

      const result1 = selectReviewQuestions(questions, telemetry, 5, DEFAULT_WEIGHTS);
      const result2 = selectReviewQuestions(questions, telemetry, 5, DEFAULT_WEIGHTS);

      expect(result1.map((r) => r.question.number)).toEqual(
        result2.map((r) => r.question.number)
      );
    });
  });

  describe("Integration scenarios", () => {
    it("should select weak questions and fill with least seen", () => {
      // Questions: 1-5
      // Telemetry: Q1 (weak), Q2 (weak), Q3 (medium), Q4 (never seen), Q5 (seen recently)
      const questions = Array.from({ length: 5 }, (_, i) => createMockQuestion(i + 1));
      const telemetry = [
        createMockTelemetry(1, 5, 0, 0, "2024-01-01T00:00:00Z"), // Weak, old
        createMockTelemetry(2, 4, 0, 0, "2024-01-02T00:00:00Z"), // Weak, less old
        createMockTelemetry(3, 2, 0, 0, "2024-01-03T00:00:00Z"), // Medium
        { ...createMockTelemetry(4, 0, 0, 0, ""), id: "exam-1::4" }, // Never seen
        createMockTelemetry(5, 0, 0, 0, "2024-01-05T00:00:00Z"), // Seen recently, no weakness
      ];

      // Request 4 questions
      const result = selectReviewQuestions(questions, telemetry, 4, DEFAULT_WEIGHTS);

      expect(result).toHaveLength(4);
      // Top by weakness should be Q1, Q2, Q3
      expect(result[0].question.number).toBe(1); // Highest weakness
      expect(result[1].question.number).toBe(2); // Second highest
      expect(result[2].question.number).toBe(3); // Third highest
    });

    it("should handle mixed seen/unseen questions correctly", () => {
      const questions = [createMockQuestion(1), createMockQuestion(2), createMockQuestion(3)];
      const telemetry = [
        createMockTelemetry(1, 2, 0, 0, ""), // Never seen (empty lastSeenAt)
        createMockTelemetry(2, 2, 0, 0, "2024-01-01T00:00:00Z"), // Seen, same weakness
        { ...createMockTelemetry(3, 0, 0, 0, ""), id: "exam-1::3" }, // Never seen, no weakness
      ];

      const result = generateReviewQuestions(questions, telemetry, 10, DEFAULT_WEIGHTS);

      // Q1 and Q2 have same weakness (4), Q1 has empty lastSeenAt so comes first
      expect(result[0].question.number).toBe(1); // Weak + never seen
      expect(result[1].question.number).toBe(2); // Weak + seen
      expect(result[2].question.number).toBe(3); // No weakness
    });
  });
});
