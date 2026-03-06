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
  examId: string = "exam-1",
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
      const questions = [
        createMockQuestion(1),
        createMockQuestion(2),
        createMockQuestion(3),
      ];
      const telemetry = [
        createMockTelemetry(1, 5, 0, 0, "2024-01-01T00:00:00Z"), // weakness = 10
        createMockTelemetry(2, 1, 0, 0, "2024-01-01T00:00:00Z"), // weakness = 2
        createMockTelemetry(3, 3, 0, 0, "2024-01-01T00:00:00Z"), // weakness = 6
      ];

      const result = generateReviewQuestions(
        questions,
        telemetry,
        10,
        DEFAULT_WEIGHTS,
      );

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

      const result = generateReviewQuestions(
        questions,
        telemetry,
        10,
        DEFAULT_WEIGHTS,
      );

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

      const result = generateReviewQuestions(
        questions,
        telemetry,
        10,
        DEFAULT_WEIGHTS,
      );

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

      const result = generateReviewQuestions(
        questions,
        telemetry,
        10,
        DEFAULT_WEIGHTS,
      );

      // Never seen (empty lastSeenAt) should come first in tie-break
      expect(result[0].question.number).toBe(2);
      expect(result[1].question.number).toBe(1);
    });

    it("should enforce review question count limit", () => {
      const questions = Array.from({ length: 10 }, (_, i) =>
        createMockQuestion(i + 1),
      );
      const telemetry = questions.map((q, i) =>
        createMockTelemetry(q.number, 10 - i, 0, 0, "2024-01-01T00:00:00Z"),
      );

      const result = generateReviewQuestions(
        questions,
        telemetry,
        5,
        DEFAULT_WEIGHTS,
      );

      expect(result).toHaveLength(5);
      // Should get the 5 highest weakness questions
      expect(result[0].question.number).toBe(1); // weakness = 20
      expect(result[4].question.number).toBe(5); // weakness = 12
    });

    it("should handle empty telemetry (all questions new)", () => {
      const questions = [
        createMockQuestion(1),
        createMockQuestion(2),
        createMockQuestion(3),
      ];

      const result = generateReviewQuestions(
        questions,
        [],
        10,
        DEFAULT_WEIGHTS,
      );

      expect(result).toHaveLength(3);
      // All have weakness 0, so sorted by question.number
      expect(result[0].question.number).toBe(1);
      expect(result[1].question.number).toBe(2);
      expect(result[2].question.number).toBe(3);
    });

    it("should not mutate input telemetry", () => {
      const questions = [createMockQuestion(1)];
      const telemetry = [
        createMockTelemetry(1, 5, 0, 0, "2024-01-01T00:00:00Z"),
      ];
      const original = JSON.stringify(telemetry);

      generateReviewQuestions(questions, telemetry, 10, DEFAULT_WEIGHTS);

      expect(JSON.stringify(telemetry)).toBe(original);
    });

    it("should mark isWeaknessBased correctly", () => {
      const questions = Array.from({ length: 5 }, (_, i) =>
        createMockQuestion(i + 1),
      );
      const telemetry = questions.map((q) =>
        createMockTelemetry(q.number, 1, 0, 0, "2024-01-01T00:00:00Z"),
      );

      const result = generateReviewQuestions(
        questions,
        telemetry,
        3,
        DEFAULT_WEIGHTS,
      );

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
          telemetry: {
            ...createMockTelemetry(2, 0, 0, 0, ""),
            id: "exam-1::2",
          },
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
      const questions = Array.from({ length: 10 }, (_, i) =>
        createMockQuestion(i + 1),
      );
      const telemetry = questions.map((q) =>
        createMockTelemetry(q.number, 1, 0, 0, "2024-01-01T00:00:00Z"),
      );

      const result = selectReviewQuestions(
        questions,
        telemetry,
        5,
        DEFAULT_WEIGHTS,
      );

      expect(result).toHaveLength(5);
    });

    it("should return all questions when fewer than count", () => {
      const questions = [createMockQuestion(1), createMockQuestion(2)];
      const telemetry = questions.map((q) =>
        createMockTelemetry(q.number, 1, 0, 0, "2024-01-01T00:00:00Z"),
      );

      const result = selectReviewQuestions(
        questions,
        telemetry,
        10,
        DEFAULT_WEIGHTS,
      );

      expect(result).toHaveLength(2);
    });

    it("should not include duplicates", () => {
      const questions = Array.from({ length: 5 }, (_, i) =>
        createMockQuestion(i + 1),
      );
      const telemetry = questions.map((q) =>
        createMockTelemetry(q.number, 1, 0, 0, "2024-01-01T00:00:00Z"),
      );

      const result = selectReviewQuestions(
        questions,
        telemetry,
        5,
        DEFAULT_WEIGHTS,
      );

      const numbers = result.map((r) => r.question.number);
      const uniqueNumbers = new Set(numbers);
      expect(uniqueNumbers.size).toBe(numbers.length);
    });

    it("should be deterministic with identical inputs", () => {
      const questions = Array.from({ length: 10 }, (_, i) =>
        createMockQuestion(i + 1),
      );
      const telemetry = questions.map((q, i) =>
        createMockTelemetry(
          q.number,
          i % 3,
          i % 2,
          0,
          `2024-01-0${(i % 9) + 1}T00:00:00Z`,
        ),
      );

      const result1 = selectReviewQuestions(
        questions,
        telemetry,
        5,
        DEFAULT_WEIGHTS,
      );
      const result2 = selectReviewQuestions(
        questions,
        telemetry,
        5,
        DEFAULT_WEIGHTS,
      );

      expect(result1.map((r) => r.question.number)).toEqual(
        result2.map((r) => r.question.number),
      );
    });
  });

  describe("Integration scenarios", () => {
    it("should select weak questions and fill with least seen", () => {
      // Questions: 1-5
      // Telemetry: Q1 (weak), Q2 (weak), Q3 (medium), Q4 (never seen), Q5 (seen recently)
      const questions = Array.from({ length: 5 }, (_, i) =>
        createMockQuestion(i + 1),
      );
      const telemetry = [
        createMockTelemetry(1, 5, 0, 0, "2024-01-01T00:00:00Z"), // Weak, old
        createMockTelemetry(2, 4, 0, 0, "2024-01-02T00:00:00Z"), // Weak, less old
        createMockTelemetry(3, 2, 0, 0, "2024-01-03T00:00:00Z"), // Medium
        { ...createMockTelemetry(4, 0, 0, 0, ""), id: "exam-1::4" }, // Never seen
        createMockTelemetry(5, 0, 0, 0, "2024-01-05T00:00:00Z"), // Seen recently, no weakness
      ];

      // Request 4 questions
      const result = selectReviewQuestions(
        questions,
        telemetry,
        4,
        DEFAULT_WEIGHTS,
      );

      expect(result).toHaveLength(4);
      // Top by weakness should be Q1, Q2, Q3
      expect(result[0].question.number).toBe(1); // Highest weakness
      expect(result[1].question.number).toBe(2); // Second highest
      expect(result[2].question.number).toBe(3); // Third highest
    });

    it("should handle mixed seen/unseen questions correctly", () => {
      const questions = [
        createMockQuestion(1),
        createMockQuestion(2),
        createMockQuestion(3),
      ];
      const telemetry = [
        createMockTelemetry(1, 2, 0, 0, ""), // Never seen (empty lastSeenAt)
        createMockTelemetry(2, 2, 0, 0, "2024-01-01T00:00:00Z"), // Seen, same weakness
        { ...createMockTelemetry(3, 0, 0, 0, ""), id: "exam-1::3" }, // Never seen, no weakness
      ];

      const result = generateReviewQuestions(
        questions,
        telemetry,
        10,
        DEFAULT_WEIGHTS,
      );

      // Q1 and Q2 have same weakness (4), Q1 has empty lastSeenAt so comes first
      expect(result[0].question.number).toBe(1); // Weak + never seen
      expect(result[1].question.number).toBe(2); // Weak + seen
      expect(result[2].question.number).toBe(3); // No weakness
    });
  });

  describe("Cooldown scheduling interaction (Phase 7)", () => {
    it("recently seen questions are deprioritized", () => {
      const now = new Date("2025-06-15T12:00:00Z").getTime();
      const justSeen = new Date(now - 30_000).toISOString(); // 30s ago
      const longAgo = new Date(now - 600_000).toISOString(); // 10min ago

      // Use 10 questions so the 60/30/10 distribution gives meaningful weak/medium buckets
      const questions = Array.from({ length: 10 }, (_, i) =>
        createMockQuestion(i + 1),
      );
      const telemetry = [
        // Q1: high weakness, just seen → should be penalized by cooldown
        createMockTelemetry(1, 5, 0, 0, justSeen), // effective: 10 * 0.2 = 2.0
        // Q2: medium weakness, seen long ago → no cooldown penalty
        createMockTelemetry(2, 3, 0, 0, longAgo), // effective: 6.0
        // Q3: high weakness, seen long ago → no cooldown penalty
        createMockTelemetry(3, 5, 0, 0, longAgo), // effective: 10.0
        // Q4: medium weakness, just seen → penalized
        createMockTelemetry(4, 3, 0, 0, justSeen), // effective: 6 * 0.2 = 1.2
        createMockTelemetry(5, 4, 0, 0, longAgo), // effective: 8.0
        createMockTelemetry(6, 2, 0, 0, longAgo), // effective: 4.0
        createMockTelemetry(7, 1, 0, 0, longAgo), // effective: 2.0
        createMockTelemetry(8, 1, 0, 0, longAgo), // effective: 2.0
        createMockTelemetry(9, 0, 0, 0, longAgo), // effective: 0
        createMockTelemetry(10, 0, 0, 0, longAgo), // effective: 0
      ];

      const cooldownConfig = {
        cooldownWindowMs: 300_000,
        cooldownMinMultiplier: 0.2,
      };

      // Use 1.0 ratios to get only weakness-based selection (no random bucket interference)
      const ratios = { weakRatio: 1.0, mediumRatio: 0.0, randomRatio: 0.0 };

      const result = selectReviewQuestions(
        questions,
        telemetry,
        5,
        DEFAULT_WEIGHTS,
        "test-seed",
        ratios,
        undefined,
        cooldownConfig,
        now,
      );

      // Sorted by effective weakness DESC: Q3(10), Q5(8), Q2(6), Q6(4), Q7(2.0), Q8(2.0), Q1(2.0)...
      // Q1 (raw weakness 10) is penalized to 2.0 by cooldown → drops below Q3,Q5,Q2,Q6
      // Q7 and Q8 (weakness 2.0, seen long ago) tie-break ahead of Q1 (justSeen) by lastSeenAt
      expect(result[0].question.number).toBe(3); // 10.0
      expect(result[1].question.number).toBe(5); // 8.0
      expect(result[2].question.number).toBe(2); // 6.0
      expect(result[3].question.number).toBe(6); // 4.0
      // Q1 is NOT in the top 5 — its cooldown penalty pushed it below others
      expect(result.some((r) => r.question.number === 1)).toBe(false);
    });

    it("older weak questions regain priority as cooldown expires", () => {
      const now = new Date("2025-06-15T12:00:00Z").getTime();
      const recentlySeen = new Date(now - 60_000).toISOString(); // 1min ago
      const almostExpired = new Date(now - 270_000).toISOString(); // 4.5min ago (90% of 5min)

      const questions = [createMockQuestion(1), createMockQuestion(2)];
      const telemetry = [
        // Q1: weakness=10, seen 1min ago → multiplier ≈ 0.2 → effective ≈ 2.0
        createMockTelemetry(1, 5, 0, 0, recentlySeen),
        // Q2: weakness=10, seen 4.5min ago → multiplier ≈ 0.9 → effective ≈ 9.0
        createMockTelemetry(2, 5, 0, 0, almostExpired),
      ];

      const cooldownConfig = {
        cooldownWindowMs: 300_000,
        cooldownMinMultiplier: 0.2,
      };

      const result = selectReviewQuestions(
        questions,
        telemetry,
        2,
        DEFAULT_WEIGHTS,
        "test-seed",
        undefined,
        undefined,
        cooldownConfig,
        now,
      );

      // Q2 almost expired cooldown → higher effective score → selected first
      expect(result[0].question.number).toBe(2);
      expect(result[1].question.number).toBe(1);
    });

    it("unseen questions are unaffected by cooldown", () => {
      const now = new Date("2025-06-15T12:00:00Z").getTime();

      const questions = [createMockQuestion(1), createMockQuestion(2)];
      // Q1: unseen (no telemetry) → cooldown multiplier = 1
      // Q2: unseen (empty lastSeenAt) → cooldown multiplier = 1
      const telemetry = [
        { ...createMockTelemetry(2, 0, 0, 0, ""), id: "exam-1::2" },
      ];

      const cooldownConfig = {
        cooldownWindowMs: 300_000,
        cooldownMinMultiplier: 0.2,
      };

      const withCooldown = selectReviewQuestions(
        questions,
        telemetry,
        2,
        DEFAULT_WEIGHTS,
        "seed",
        undefined,
        undefined,
        cooldownConfig,
        now,
      );
      const withoutCooldown = selectReviewQuestions(
        questions,
        telemetry,
        2,
        DEFAULT_WEIGHTS,
        "seed",
      );

      // Same order since all unseen — cooldown shouldn't change anything
      expect(withCooldown.map((r) => r.question.number)).toEqual(
        withoutCooldown.map((r) => r.question.number),
      );
    });

    it("60/30/10 distribution is still respected with cooldown", () => {
      const now = new Date("2025-06-15T12:00:00Z").getTime();
      const longAgo = new Date(now - 600_000).toISOString(); // no cooldown

      // Create 20 questions with varied weakness, all seen long ago (no cooldown effect)
      const questions = Array.from({ length: 20 }, (_, i) =>
        createMockQuestion(i + 1),
      );
      const telemetry = questions.map((q, i) =>
        createMockTelemetry(q.number, 10 - Math.floor(i / 2), 0, 0, longAgo),
      );

      const cooldownConfig = {
        cooldownWindowMs: 300_000,
        cooldownMinMultiplier: 0.2,
      };
      const ratios = { weakRatio: 0.6, mediumRatio: 0.3, randomRatio: 0.1 };

      const result = selectReviewQuestions(
        questions,
        telemetry,
        10,
        DEFAULT_WEIGHTS,
        "seed",
        ratios,
        undefined,
        cooldownConfig,
        now,
      );

      // Should still select 10 questions
      expect(result).toHaveLength(10);
      // No duplicates
      const numbers = new Set(result.map((r) => r.question.number));
      expect(numbers.size).toBe(10);
    });
  });

  describe("Difficulty adjustment interaction (Phase 8)", () => {
    const difficultyConfig = {
      easyBoost: 1.2,
      mediumBoost: 1.0,
      hardPenalty: 0.85,
    };

    it("easy questions get higher priority when failed (boosted weakness)", () => {
      // Q1: easy question (always correct in telemetry) but has high weakness from wrong answers
      // Q2: hard question (mostly wrong in telemetry) with same raw weakness
      const questions = Array.from({ length: 10 }, (_, i) =>
        createMockQuestion(i + 1),
      );

      const telemetry = [
        // Q1: 2 wrong, but 8 correct → difficulty = 2/10 = 0.2 (easy) → boost 1.2
        createMockTelemetry(1, 2, 0, 0, "2024-01-01T00:00:00Z", "exam-1"),
        // Q2: 2 wrong, but only 3 total seen → difficulty = 2/3 ≈ 0.67 (hard) → penalty 0.85
        {
          ...createMockTelemetry(2, 2, 0, 0, "2024-01-01T00:00:00Z", "exam-1"),
          timesCorrect: 1,
          totalSeen: 3,
        },
      ];

      // Override totalSeen for Q1 to make it "easy"
      telemetry[0] = {
        ...telemetry[0],
        timesCorrect: 8,
        totalSeen: 10,
      };

      const ratios = { weakRatio: 1.0, mediumRatio: 0.0, randomRatio: 0.0 };

      const withDifficulty = selectReviewQuestions(
        questions,
        telemetry,
        2,
        DEFAULT_WEIGHTS,
        "test-seed",
        ratios,
        undefined,
        undefined,
        undefined,
        difficultyConfig,
      );

      const withoutDifficulty = selectReviewQuestions(
        questions,
        telemetry,
        2,
        DEFAULT_WEIGHTS,
        "test-seed",
        ratios,
      );

      // Q1 raw weakness = 2*2 = 4, Q2 raw weakness = 2*2 = 4
      // With difficulty: Q1 effective = 4 * 1.2 = 4.8, Q2 effective = 4 * 0.85 = 3.4
      // So Q1 should be first with difficulty adjustment
      expect(withDifficulty[0].question.number).toBe(1);

      // Without difficulty, they have equal weakness, tie-break by lastSeenAt then number
      expect(withoutDifficulty[0].question.number).toBe(1); // Same lastSeenAt, lower number
    });

    it("hard questions receive lower weight (reduced effective weakness)", () => {
      const questions = [createMockQuestion(1), createMockQuestion(2)];

      // Both have same raw weakness (timesWrong=3)
      // Q1: difficulty = 3/4 = 0.75 (hard) → penalty 0.85
      // Q2: difficulty = 3/15 = 0.2 (easy) → boost 1.2
      const telemetry = [
        {
          ...createMockTelemetry(1, 3, 0, 0, "2024-01-01T00:00:00Z"),
          timesCorrect: 1,
          totalSeen: 4,
        },
        {
          ...createMockTelemetry(2, 3, 0, 0, "2024-01-01T00:00:00Z"),
          timesCorrect: 12,
          totalSeen: 15,
        },
      ];

      const ratios = { weakRatio: 1.0, mediumRatio: 0.0, randomRatio: 0.0 };

      const result = selectReviewQuestions(
        questions,
        telemetry,
        2,
        DEFAULT_WEIGHTS,
        "test-seed",
        ratios,
        undefined,
        undefined,
        undefined,
        difficultyConfig,
      );

      // Q1 effective weakness: 6 * 0.85 = 5.1 (hard)
      // Q2 effective weakness: 6 * 1.2  = 7.2 (easy, boosted)
      // Q2 should rank first
      expect(result[0].question.number).toBe(2);
      expect(result[1].question.number).toBe(1);
    });

    it("review selection remains deterministic with difficulty", () => {
      const questions = Array.from({ length: 10 }, (_, i) =>
        createMockQuestion(i + 1),
      );
      const telemetry = questions.map((q, i) => ({
        ...createMockTelemetry(
          q.number,
          i % 3,
          i % 2,
          0,
          `2024-01-0${(i % 9) + 1}T00:00:00Z`,
        ),
        timesCorrect: 5,
        totalSeen: 5 + (i % 3) + (i % 2),
      }));

      const result1 = selectReviewQuestions(
        questions,
        telemetry,
        5,
        DEFAULT_WEIGHTS,
        "test-seed",
        undefined,
        undefined,
        undefined,
        undefined,
        difficultyConfig,
      );
      const result2 = selectReviewQuestions(
        questions,
        telemetry,
        5,
        DEFAULT_WEIGHTS,
        "test-seed",
        undefined,
        undefined,
        undefined,
        undefined,
        difficultyConfig,
      );

      expect(result1.map((r) => r.question.number)).toEqual(
        result2.map((r) => r.question.number),
      );
    });

    it("cooldown still respected with difficulty adjustment", () => {
      const now = new Date("2025-06-15T12:00:00Z").getTime();
      const justSeen = new Date(now - 30_000).toISOString(); // 30s ago
      const longAgo = new Date(now - 600_000).toISOString(); // 10min ago

      const questions = [createMockQuestion(1), createMockQuestion(2)];
      const telemetry = [
        // Q1: high weakness, just seen → cooldown penalizes heavily, easy → difficulty boosts
        {
          ...createMockTelemetry(1, 5, 0, 0, justSeen),
          timesCorrect: 8,
          totalSeen: 13,
        },
        // Q2: high weakness, seen long ago → no cooldown, hard → difficulty penalizes
        {
          ...createMockTelemetry(2, 5, 0, 0, longAgo),
          timesCorrect: 1,
          totalSeen: 6,
        },
      ];

      const cooldownConfig = {
        cooldownWindowMs: 300_000,
        cooldownMinMultiplier: 0.2,
      };

      const ratios = { weakRatio: 1.0, mediumRatio: 0.0, randomRatio: 0.0 };

      const result = selectReviewQuestions(
        questions,
        telemetry,
        2,
        DEFAULT_WEIGHTS,
        "test-seed",
        ratios,
        undefined,
        cooldownConfig,
        now,
        difficultyConfig,
      );

      // Q1 raw weakness=10, cooldown ≈ 0.2 → 2.0, difficulty easy (5/13≈0.38 → medium) → *1.0 = 2.0
      // Q2 raw weakness=10, no cooldown → 10, difficulty hard (5/6≈0.83) → *0.85 = 8.5
      // Q2 should be first
      expect(result[0].question.number).toBe(2);
      expect(result[1].question.number).toBe(1);
    });

    it("60/30/10 distribution preserved with difficulty adjustment", () => {
      const now = new Date("2025-06-15T12:00:00Z").getTime();
      const longAgo = new Date(now - 600_000).toISOString();

      const questions = Array.from({ length: 20 }, (_, i) =>
        createMockQuestion(i + 1),
      );
      const telemetry = questions.map((q, i) => ({
        ...createMockTelemetry(q.number, 10 - Math.floor(i / 2), 0, 0, longAgo),
        timesCorrect: Math.floor(i / 2),
        totalSeen: 10,
      }));

      const ratios = { weakRatio: 0.6, mediumRatio: 0.3, randomRatio: 0.1 };

      const result = selectReviewQuestions(
        questions,
        telemetry,
        10,
        DEFAULT_WEIGHTS,
        "seed",
        ratios,
        undefined,
        undefined,
        undefined,
        difficultyConfig,
      );

      // Should still select 10 questions
      expect(result).toHaveLength(10);
      // No duplicates
      const numbers = new Set(result.map((r) => r.question.number));
      expect(numbers.size).toBe(10);
    });
  });
});
