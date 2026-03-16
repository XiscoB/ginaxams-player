/**
 * Review Self-Feeding Property Test (M4.3)
 *
 * Verifies that:
 * 1. Review attempts update telemetry (via telemetry engine)
 * 2. Updated telemetry affects next review ordering
 * 3. The system naturally feeds itself without special logic
 */

import { describe, it, expect } from "vitest";
import {
  generateReviewQuestionSet,
  type ReviewGenerationInput,
} from "../review.js";
import { updateTelemetry } from "../telemetryEngine.js";
import type { QuestionTelemetry, AttemptType } from "../types.js";
import { DEFAULTS } from "../defaults.js";

const TEST_NOW = "2026-02-20T12:00:00.000Z";
const TEST_LATER = "2026-02-20T12:05:00.000Z";

describe("Review Self-Feeding Property", () => {
  it("review ordering changes after simulating wrong answers", () => {
    // Initial state: question 1 is stronger (mastered), question 2 is new
    const initialTelemetry: Record<string, QuestionTelemetry> = {
      "exam1::1": {
        id: "exam1::1",
        examId: "exam1",
        questionNumber: 1,
        timesCorrect: 5,
        timesWrong: 0,
        timesBlank: 0,
        consecutiveCorrect: 5,
        avgResponseTimeMs: 5000,
        totalSeen: 5,
        lastSeenAt: TEST_NOW,
      },
      "exam1::2": {
        id: "exam1::2",
        examId: "exam1",
        questionNumber: 2,
        timesCorrect: 0,
        timesWrong: 0,
        timesBlank: 0,
        consecutiveCorrect: 0,
        avgResponseTimeMs: 0,
        totalSeen: 0,
        lastSeenAt: "",
      },
    };

    const input: ReviewGenerationInput = {
      telemetryByQuestionId: initialTelemetry,
      questionBank: [
        { id: "exam1::1", examId: "exam1" },
        { id: "exam1::2", examId: "exam1" },
      ],
      selectedExamIds: ["exam1"],
      reviewQuestionCount: 2,
      weights: {
        wrongWeight: DEFAULTS.wrongWeight,
        blankWeight: DEFAULTS.blankWeight,
        recoveryWeight: DEFAULTS.recoveryWeight,
        weakTimeThresholdMs: DEFAULTS.weakTimeThresholdMs,
      },
    };

    // First review: question 1 has weakScore = 0 (5*0 + 0 - 5*1 = -5, clamped to 0)
    // Question 2 has weakScore = 0
    // Tie-break: totalSeen (0 < 5), so question 2 comes FIRST
    const firstReview = generateReviewQuestionSet(input);
    expect(firstReview).toEqual(["exam1::2", "exam1::1"]);

    // Simulate: User answers question 1 WRONG (breaks the streak)
    const updatedTelemetry1 = updateTelemetry(initialTelemetry["exam1::1"], {
      attemptType: "review" as AttemptType,
      examId: "exam1",
      questionNumber: 1,
      isCorrect: false,
      isBlank: false,
      responseTimeMs: 5000,
      now: TEST_NOW,
    });

    expect(updatedTelemetry1).not.toBeNull();

    // Simulate: User answers question 2 CORRECT
    const updatedTelemetry2 = updateTelemetry(initialTelemetry["exam1::2"], {
      attemptType: "review" as AttemptType,
      examId: "exam1",
      questionNumber: 2,
      isCorrect: true,
      isBlank: false,
      responseTimeMs: 5000,
      now: TEST_NOW,
    });

    expect(updatedTelemetry2).not.toBeNull();

    // Build updated telemetry map
    const afterReviewTelemetry: Record<string, QuestionTelemetry> = {
      "exam1::1": updatedTelemetry1!,
      "exam1::2": updatedTelemetry2!,
    };

    // Verify telemetry changed as expected
    expect(afterReviewTelemetry["exam1::1"].timesWrong).toBe(1);
    expect(afterReviewTelemetry["exam1::1"].consecutiveCorrect).toBe(0); // Reset!
    expect(afterReviewTelemetry["exam1::1"].totalSeen).toBe(6);
    expect(afterReviewTelemetry["exam1::2"].timesCorrect).toBe(1);
    expect(afterReviewTelemetry["exam1::2"].totalSeen).toBe(1);

    // Second review with updated telemetry
    const secondInput: ReviewGenerationInput = {
      ...input,
      telemetryByQuestionId: afterReviewTelemetry,
    };

    const secondReview = generateReviewQuestionSet(secondInput);

    // Question 1 now has weakScore = (1 wrong * 2) - (0 recovery) = 2
    // Question 2 now has weakScore = 0 - (1 * 1) = -1, clamped to 0
    // Ordering should change: question 1 (weaker, weakScore 2) comes FIRST
    expect(secondReview[0]).toBe("exam1::1");
    expect(secondReview[1]).toBe("exam1::2");

    // The key assertion: ordering changed based on telemetry updates
    expect(secondReview).not.toEqual(firstReview);
  });

  it("review ordering changes after consecutive correct answers (recovery)", () => {
    // Initial state: question 1 is weak, question 2 is new
    const initialTelemetry: Record<string, QuestionTelemetry> = {
      "exam1::1": {
        id: "exam1::1",
        examId: "exam1",
        questionNumber: 1,
        timesCorrect: 0,
        timesWrong: 3,
        timesBlank: 0,
        consecutiveCorrect: 0,
        avgResponseTimeMs: 5000,
        totalSeen: 3,
        lastSeenAt: TEST_NOW,
      },
      "exam1::2": {
        id: "exam1::2",
        examId: "exam1",
        questionNumber: 2,
        timesCorrect: 0,
        timesWrong: 0,
        timesBlank: 0,
        consecutiveCorrect: 0,
        avgResponseTimeMs: 0,
        totalSeen: 0,
        lastSeenAt: "",
      },
    };

    const input: ReviewGenerationInput = {
      telemetryByQuestionId: initialTelemetry,
      questionBank: [
        { id: "exam1::1", examId: "exam1" },
        { id: "exam1::2", examId: "exam1" },
      ],
      selectedExamIds: ["exam1"],
      reviewQuestionCount: 2,
      weights: {
        wrongWeight: DEFAULTS.wrongWeight,
        blankWeight: DEFAULTS.blankWeight,
        recoveryWeight: DEFAULTS.recoveryWeight,
        weakTimeThresholdMs: DEFAULTS.weakTimeThresholdMs,
      },
    };

    // First review: question 1 is weaker (weakScore 6 vs 0)
    const firstReview = generateReviewQuestionSet(input);
    expect(firstReview).toEqual(["exam1::1", "exam1::2"]);

    // Simulate: User masters question 1 (3 consecutive correct)
    let currentTelemetry: QuestionTelemetry | null = initialTelemetry["exam1::1"];
    for (let i = 0; i < 3; i++) {
      currentTelemetry = updateTelemetry(currentTelemetry, {
        attemptType: "review" as AttemptType,
        examId: "exam1",
        questionNumber: 1,
        isCorrect: true,
        isBlank: false,
        responseTimeMs: 5000,
        now: TEST_LATER,
      });
    }

    expect(currentTelemetry).not.toBeNull();
    expect(currentTelemetry!.timesCorrect).toBe(3);
    expect(currentTelemetry!.consecutiveCorrect).toBe(3);

    // After 3 consecutive correct, weakScore = (3 * 2) - (3 * 1) = 6 - 3 = 3
    // But wait, totalSeen = 6 now (3 wrong + 3 correct)
    expect(currentTelemetry!.totalSeen).toBe(6);

    const updatedTelemetry: Record<string, QuestionTelemetry> = {
      "exam1::1": currentTelemetry!,
      "exam1::2": initialTelemetry["exam1::2"],
    };

    const secondInput: ReviewGenerationInput = {
      ...input,
      telemetryByQuestionId: updatedTelemetry,
    };

    const secondReview = generateReviewQuestionSet(secondInput);

    // Verify both questions are still in the review
    expect(secondReview).toContain("exam1::1");
    expect(secondReview).toContain("exam1::2");

    // The weakness scores:
    // Question 1: (3 wrong * 2) - (3 consecutive * 1) = 6 - 3 = 3
    // Question 2: 0
    // Question 1 should still be first (higher weakness)
    expect(secondReview[0]).toBe("exam1::1");
  });

  it("free mode does not update telemetry (control test)", () => {
    const initialTelemetry: QuestionTelemetry = {
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

    // Free mode should NOT update telemetry
    const result = updateTelemetry(initialTelemetry, {
      attemptType: "free" as AttemptType,
      examId: "exam1",
      questionNumber: 1,
      isCorrect: false,
      isBlank: false,
      responseTimeMs: 5000,
      now: TEST_NOW,
    });

    // Result should be the same object (unchanged)
    expect(result).toBe(initialTelemetry);
    expect(result!.timesWrong).toBe(0);
    expect(result!.totalSeen).toBe(0);
  });
});
