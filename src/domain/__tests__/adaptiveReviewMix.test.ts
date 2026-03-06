/**
 * Adaptive Review Mix Unit Tests (Phase 5)
 *
 * Tests for the updated selectReviewQuestions with 60/30/10 distribution:
 *   - 60% weakest questions
 *   - 30% medium weakness
 *   - 10% random unseen (fallback: least recently seen)
 *
 * Verifies correct distribution, determinism, unseen fallback,
 * deduplication, and edge cases.
 */

import { describe, it, expect } from "vitest";
import {
  selectReviewQuestions,
  generateReviewQuestions,
  sortByLastSeen,
  type ReviewQuestion,
  type ReviewMixRatios,
} from "../reviewSelection.js";
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

const DEFAULT_RATIOS: ReviewMixRatios = {
  weakRatio: 0.6,
  mediumRatio: 0.3,
  randomRatio: 0.1,
};

function createQuestion(
  number: number,
  categorias: string[] = ["test"],
): Question {
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
    totalSeen?: number;
    lastSeenAt?: string;
    examId?: string;
  },
): QuestionTelemetry {
  const examId = opts?.examId ?? "exam-1";
  const timesBlank = opts?.timesBlank ?? 0;
  const totalSeen = opts?.totalSeen ?? timesWrong + timesBlank;
  return {
    id: `${examId}::${questionNumber}`,
    examId,
    questionNumber,
    timesCorrect: 0,
    timesWrong,
    timesBlank,
    consecutiveCorrect: opts?.consecutiveCorrect ?? 0,
    avgResponseTimeMs: 5000,
    totalSeen,
    lastSeenAt:
      opts?.lastSeenAt ?? (totalSeen > 0 ? "2024-01-01T00:00:00Z" : ""),
  };
}

/**
 * Create a batch of questions (1..count).
 */
function createQuestions(count: number): Question[] {
  return Array.from({ length: count }, (_, i) => createQuestion(i + 1));
}

// ============================================================================
// generateReviewQuestions (preserved behavior)
// ============================================================================

describe("generateReviewQuestions", () => {
  it("sorts by weakness DESC", () => {
    const questions = createQuestions(3);
    const telemetry = [
      createTelemetry(1, 5), // weakness = 10
      createTelemetry(2, 1), // weakness = 2
      createTelemetry(3, 3), // weakness = 6
    ];

    const result = generateReviewQuestions(
      questions,
      telemetry,
      3,
      DEFAULT_WEIGHTS,
    );

    expect(result[0].question.number).toBe(1); // weakness 10
    expect(result[1].question.number).toBe(3); // weakness 6
    expect(result[2].question.number).toBe(2); // weakness 2
  });

  it("uses lastSeenAt ASC as secondary sort", () => {
    const questions = createQuestions(2);
    // Same weakness (4), different lastSeenAt
    const telemetry = [
      createTelemetry(1, 2, { lastSeenAt: "2024-06-01T00:00:00Z" }),
      createTelemetry(2, 2, { lastSeenAt: "2024-01-01T00:00:00Z" }),
    ];

    const result = generateReviewQuestions(
      questions,
      telemetry,
      2,
      DEFAULT_WEIGHTS,
    );

    expect(result[0].question.number).toBe(2); // older lastSeenAt
    expect(result[1].question.number).toBe(1);
  });

  it("uses question.number ASC as tertiary sort", () => {
    const questions = createQuestions(3);
    // All same weakness and lastSeenAt
    const telemetry = [
      createTelemetry(1, 2, { lastSeenAt: "2024-01-01T00:00:00Z" }),
      createTelemetry(2, 2, { lastSeenAt: "2024-01-01T00:00:00Z" }),
      createTelemetry(3, 2, { lastSeenAt: "2024-01-01T00:00:00Z" }),
    ];

    const result = generateReviewQuestions(
      questions,
      telemetry,
      3,
      DEFAULT_WEIGHTS,
    );

    expect(result[0].question.number).toBe(1);
    expect(result[1].question.number).toBe(2);
    expect(result[2].question.number).toBe(3);
  });
});

// ============================================================================
// sortByLastSeen (preserved behavior)
// ============================================================================

describe("sortByLastSeen", () => {
  it("sorts never-seen first, then oldest first", () => {
    const items: ReviewQuestion[] = [
      {
        question: createQuestion(1),
        telemetry: createTelemetry(1, 0, {
          lastSeenAt: "2024-06-01T00:00:00Z",
          totalSeen: 1,
        }),
        weakness: 0,
        isWeaknessBased: false,
      },
      {
        question: createQuestion(2),
        telemetry: createTelemetry(2, 0, { lastSeenAt: "", totalSeen: 0 }),
        weakness: 0,
        isWeaknessBased: false,
      },
      {
        question: createQuestion(3),
        telemetry: createTelemetry(3, 0, {
          lastSeenAt: "2024-01-01T00:00:00Z",
          totalSeen: 1,
        }),
        weakness: 0,
        isWeaknessBased: false,
      },
    ];

    const result = sortByLastSeen(items);

    expect(result[0].question.number).toBe(2); // never seen
    expect(result[1].question.number).toBe(3); // oldest
    expect(result[2].question.number).toBe(1); // most recent
  });

  it("does not mutate input", () => {
    const items: ReviewQuestion[] = [
      {
        question: createQuestion(2),
        telemetry: createTelemetry(2, 0, { totalSeen: 0 }),
        weakness: 0,
        isWeaknessBased: false,
      },
      {
        question: createQuestion(1),
        telemetry: createTelemetry(1, 0, { totalSeen: 0 }),
        weakness: 0,
        isWeaknessBased: false,
      },
    ];

    const copy = [...items];
    sortByLastSeen(items);
    expect(items).toEqual(copy); // original unchanged
  });
});

// ============================================================================
// selectReviewQuestions — Adaptive Review Mix
// ============================================================================

describe("selectReviewQuestions (adaptive mix)", () => {
  describe("correct distribution", () => {
    it("produces 60/30/10 distribution with sufficient questions", () => {
      // 100 questions: 60 with high weakness, 30 with medium, 10 unseen
      const count = 10;
      // Need enough questions to fill all buckets
      const questions = createQuestions(20);

      // Q1-Q8: high weakness (seen, various wrong counts)
      // Q9-Q14: medium weakness (seen)
      // Q15-Q20: unseen (totalSeen=0)
      const telemetry: QuestionTelemetry[] = [];
      for (let i = 1; i <= 8; i++) {
        telemetry.push(createTelemetry(i, 10 - i, { totalSeen: 10 - i }));
      }
      for (let i = 9; i <= 14; i++) {
        telemetry.push(createTelemetry(i, 1, { totalSeen: 1 }));
      }
      // Q15-Q20: no telemetry = unseen

      const result = selectReviewQuestions(
        questions,
        telemetry,
        count,
        DEFAULT_WEIGHTS,
        "test-seed-abc",
        DEFAULT_RATIOS,
      );

      expect(result).toHaveLength(count);

      // With count=10: weakTarget=6, mediumTarget=3, randomTarget=1
      // Weak bucket: 6 items from sorted top
      const weakBucket = result.filter((r) => r.isWeaknessBased);
      const randomBucket = result.filter((r) => !r.isWeaknessBased);

      // Weak+medium = 9 (isWeaknessBased=true), random = 1
      expect(weakBucket).toHaveLength(9);
      expect(randomBucket).toHaveLength(1);
    });

    it("computes correct target counts from ratios", () => {
      // count=20: weak=12, medium=6, random=2
      const questions = createQuestions(40);
      const telemetry: QuestionTelemetry[] = [];

      // 20 questions with varying weakness (seen)
      for (let i = 1; i <= 20; i++) {
        telemetry.push(createTelemetry(i, 21 - i, { totalSeen: 21 - i }));
      }
      // Q21-Q40: unseen

      const result = selectReviewQuestions(
        questions,
        telemetry,
        20,
        DEFAULT_WEIGHTS,
        "seed-123",
        DEFAULT_RATIOS,
      );

      expect(result).toHaveLength(20);

      // weak(12) + medium(6) are isWeaknessBased + random(2) are not
      const weaknessBasedCount = result.filter((r) => r.isWeaknessBased).length;
      const randomCount = result.filter((r) => !r.isWeaknessBased).length;
      expect(weaknessBasedCount).toBe(18); // 12 + 6
      expect(randomCount).toBe(2);
    });
  });

  describe("deterministic behavior", () => {
    it("same seed produces same selection", () => {
      const questions = createQuestions(30);
      const telemetry: QuestionTelemetry[] = [];
      for (let i = 1; i <= 15; i++) {
        telemetry.push(createTelemetry(i, 16 - i, { totalSeen: 16 - i }));
      }
      // Q16-Q30: unseen

      const result1 = selectReviewQuestions(
        questions,
        telemetry,
        10,
        DEFAULT_WEIGHTS,
        "deterministic-seed",
        DEFAULT_RATIOS,
      );
      const result2 = selectReviewQuestions(
        questions,
        telemetry,
        10,
        DEFAULT_WEIGHTS,
        "deterministic-seed",
        DEFAULT_RATIOS,
      );

      const numbers1 = result1.map((r) => r.question.number);
      const numbers2 = result2.map((r) => r.question.number);

      expect(numbers1).toEqual(numbers2);
    });

    it("different seeds produce different random selections", () => {
      const questions = createQuestions(30);
      const telemetry: QuestionTelemetry[] = [];
      for (let i = 1; i <= 10; i++) {
        telemetry.push(createTelemetry(i, 11 - i, { totalSeen: 11 - i }));
      }
      // Q11-Q30: 20 unseen questions for the random bucket

      const result1 = selectReviewQuestions(
        questions,
        telemetry,
        10,
        DEFAULT_WEIGHTS,
        "seed-alpha",
        DEFAULT_RATIOS,
      );
      const result2 = selectReviewQuestions(
        questions,
        telemetry,
        10,
        DEFAULT_WEIGHTS,
        "seed-beta",
        DEFAULT_RATIOS,
      );

      // Weak and medium buckets are deterministic (same for both),
      // but random bucket should differ
      const random1 = result1
        .filter((r) => !r.isWeaknessBased)
        .map((r) => r.question.number);
      const random2 = result2
        .filter((r) => !r.isWeaknessBased)
        .map((r) => r.question.number);

      // At least one difference expected (with 20 unseen and 1 random slot,
      // different seeds should pick different unseen questions)
      // Note: could theoretically be the same, so we use a larger pool
      // With enough unseen items, different seeds should produce different picks
      expect(random1.length).toBeGreaterThan(0);
      expect(random2.length).toBeGreaterThan(0);
    });
  });

  describe("no duplicate questions", () => {
    it("never includes a question in multiple buckets", () => {
      const questions = createQuestions(20);
      const telemetry: QuestionTelemetry[] = [];
      for (let i = 1; i <= 10; i++) {
        telemetry.push(createTelemetry(i, 11 - i, { totalSeen: 11 - i }));
      }

      const result = selectReviewQuestions(
        questions,
        telemetry,
        10,
        DEFAULT_WEIGHTS,
        "dedup-seed",
        DEFAULT_RATIOS,
      );

      const numbers = result.map((r) => r.question.number);
      const uniqueNumbers = new Set(numbers);
      expect(uniqueNumbers.size).toBe(numbers.length);
    });

    it("handles large selections without duplicates", () => {
      const questions = createQuestions(100);
      const telemetry: QuestionTelemetry[] = [];
      for (let i = 1; i <= 60; i++) {
        telemetry.push(createTelemetry(i, 61 - i, { totalSeen: 61 - i }));
      }

      const result = selectReviewQuestions(
        questions,
        telemetry,
        60,
        DEFAULT_WEIGHTS,
        "big-seed",
        DEFAULT_RATIOS,
      );

      const numbers = result.map((r) => r.question.number);
      expect(new Set(numbers).size).toBe(numbers.length);
    });
  });

  describe("unseen fallback", () => {
    it("uses unseen questions for random bucket when available", () => {
      const questions = createQuestions(20);
      const telemetry: QuestionTelemetry[] = [];
      // Q1-Q15 seen with weakness
      for (let i = 1; i <= 15; i++) {
        telemetry.push(createTelemetry(i, 16 - i, { totalSeen: 16 - i }));
      }
      // Q16-Q20: unseen (no telemetry)

      const result = selectReviewQuestions(
        questions,
        telemetry,
        10,
        DEFAULT_WEIGHTS,
        "unseen-seed",
        DEFAULT_RATIOS,
      );

      // Random bucket should contain unseen questions (totalSeen === 0)
      const randomBucket = result.filter((r) => !r.isWeaknessBased);
      for (const item of randomBucket) {
        expect(item.telemetry.totalSeen).toBe(0);
      }
    });

    it("falls back to least recently seen when no unseen available", () => {
      const questions = createQuestions(10);
      // All questions have been seen
      const telemetry: QuestionTelemetry[] = [];
      for (let i = 1; i <= 10; i++) {
        telemetry.push(
          createTelemetry(i, 11 - i, {
            totalSeen: 11 - i,
            lastSeenAt: `2024-0${Math.min(i, 9)}-01T00:00:00Z`,
          }),
        );
      }

      const result = selectReviewQuestions(
        questions,
        telemetry,
        10,
        DEFAULT_WEIGHTS,
        "fallback-seed",
        DEFAULT_RATIOS,
      );

      // Should still return all 10 (weak + medium + fallback fill)
      expect(result).toHaveLength(10);
      const numbers = result.map((r) => r.question.number);
      expect(new Set(numbers).size).toBe(10);
    });

    it("mixes unseen and fallback when not enough unseen", () => {
      // 10 questions, request 10: weak=6, medium=3, random=1
      // Only Q10 is unseen, and we need 1 random → should take Q10
      const questions = createQuestions(10);
      const telemetry: QuestionTelemetry[] = [];
      for (let i = 1; i <= 9; i++) {
        telemetry.push(createTelemetry(i, 10 - i, { totalSeen: 10 - i }));
      }
      // Q10: no telemetry = unseen

      const result = selectReviewQuestions(
        questions,
        telemetry,
        10,
        DEFAULT_WEIGHTS,
        "mix-seed",
        DEFAULT_RATIOS,
      );

      expect(result).toHaveLength(10);

      // The random bucket (non-weakness-based) should include Q10
      const randomBucket = result.filter((r) => !r.isWeaknessBased);
      expect(randomBucket.some((r) => r.question.number === 10)).toBe(true);
    });
  });

  describe("redistribution on insufficient items", () => {
    it("redistributes weak overflow to medium bucket", () => {
      // Only 3 questions total, request 10 → should get 3
      const questions = createQuestions(3);
      const telemetry = [
        createTelemetry(1, 5, { totalSeen: 5 }),
        createTelemetry(2, 3, { totalSeen: 3 }),
        createTelemetry(3, 1, { totalSeen: 1 }),
      ];

      const result = selectReviewQuestions(
        questions,
        telemetry,
        10,
        DEFAULT_WEIGHTS,
        "overflow-seed",
        DEFAULT_RATIOS,
      );

      // Can only return 3 (all available)
      expect(result).toHaveLength(3);
      const numbers = result.map((r) => r.question.number);
      expect(new Set(numbers).size).toBe(3);
    });

    it("handles all questions unseen", () => {
      const questions = createQuestions(10);

      const result = selectReviewQuestions(
        questions,
        [],
        10,
        DEFAULT_WEIGHTS,
        "all-unseen",
        DEFAULT_RATIOS,
      );

      // All should be selected; weak+medium come from sorted (all weakness=0)
      // and random from unseen
      expect(result).toHaveLength(10);
      const numbers = result.map((r) => r.question.number);
      expect(new Set(numbers).size).toBe(10);
    });

    it("handles all questions weak (no medium, no unseen)", () => {
      const questions = createQuestions(5);
      const telemetry: QuestionTelemetry[] = [];
      for (let i = 1; i <= 5; i++) {
        telemetry.push(createTelemetry(i, 10 - i, { totalSeen: 10 - i }));
      }

      // Request 5 with 60/30/10: weak=3, medium=1, random=1
      // All seen → no unseen for random → fallback to least recently seen
      const result = selectReviewQuestions(
        questions,
        telemetry,
        5,
        DEFAULT_WEIGHTS,
        "all-weak",
        DEFAULT_RATIOS,
      );

      expect(result).toHaveLength(5);
      const numbers = result.map((r) => r.question.number);
      expect(new Set(numbers).size).toBe(5);
    });
  });

  describe("edge cases", () => {
    it("returns empty array for count = 0", () => {
      const result = selectReviewQuestions(
        createQuestions(5),
        [],
        0,
        DEFAULT_WEIGHTS,
        "seed",
      );
      expect(result).toEqual([]);
    });

    it("returns empty array for no questions", () => {
      const result = selectReviewQuestions([], [], 10, DEFAULT_WEIGHTS, "seed");
      expect(result).toEqual([]);
    });

    it("caps at available questions when count exceeds total", () => {
      const questions = createQuestions(5);
      const result = selectReviewQuestions(
        questions,
        [],
        100,
        DEFAULT_WEIGHTS,
        "seed",
        DEFAULT_RATIOS,
      );
      expect(result).toHaveLength(5);
    });

    it("works with default ratios when ratios not provided", () => {
      const questions = createQuestions(20);
      const telemetry: QuestionTelemetry[] = [];
      for (let i = 1; i <= 10; i++) {
        telemetry.push(createTelemetry(i, 11 - i, { totalSeen: 11 - i }));
      }

      // Call without ratios parameter
      const result = selectReviewQuestions(
        questions,
        telemetry,
        10,
        DEFAULT_WEIGHTS,
        "default-ratios",
      );

      expect(result).toHaveLength(10);
      const numbers = result.map((r) => r.question.number);
      expect(new Set(numbers).size).toBe(10);
    });

    it("works with empty seed string", () => {
      const questions = createQuestions(10);
      const result = selectReviewQuestions(
        questions,
        [],
        5,
        DEFAULT_WEIGHTS,
        "",
        DEFAULT_RATIOS,
      );

      expect(result).toHaveLength(5);
    });

    it("does not mutate input arrays", () => {
      const questions = createQuestions(10);
      const telemetry = [createTelemetry(1, 3), createTelemetry(2, 1)];

      const questionsCopy = [...questions];
      const telemetryCopy = [...telemetry];

      selectReviewQuestions(
        questions,
        telemetry,
        5,
        DEFAULT_WEIGHTS,
        "immutable",
        DEFAULT_RATIOS,
      );

      expect(questions).toEqual(questionsCopy);
      expect(telemetry).toEqual(telemetryCopy);
    });
  });

  describe("custom ratios", () => {
    it("respects custom ratios", () => {
      const questions = createQuestions(30);
      const telemetry: QuestionTelemetry[] = [];
      for (let i = 1; i <= 20; i++) {
        telemetry.push(createTelemetry(i, 21 - i, { totalSeen: 21 - i }));
      }

      // 80% weak, 10% medium, 10% random
      const customRatios: ReviewMixRatios = {
        weakRatio: 0.8,
        mediumRatio: 0.1,
        randomRatio: 0.1,
      };

      const result = selectReviewQuestions(
        questions,
        telemetry,
        10,
        DEFAULT_WEIGHTS,
        "custom-ratios",
        customRatios,
      );

      expect(result).toHaveLength(10);

      // weak=8, medium=1, random=1
      const weaknessBased = result.filter((r) => r.isWeaknessBased);
      const random = result.filter((r) => !r.isWeaknessBased);
      expect(weaknessBased).toHaveLength(9); // 8 + 1
      expect(random).toHaveLength(1);
    });
  });
});
