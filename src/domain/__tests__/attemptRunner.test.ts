/**
 * AttemptRunner Unit Tests
 *
 * Pure domain tests - no storage, no UI, no telemetry persistence.
 * Verifies deterministic behavior of the attempt execution engine.
 */

import { describe, it, expect } from "vitest";
import { AttemptRunner } from "../attemptRunner.js";
import type { Question, FreeAttempt, SimulacroAttempt, ReviewAttempt, QuestionTelemetry } from "../types.js";

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockQuestion(number: number, correctIndex: number): Question {
  return {
    number,
    text: `Question ${number}`,
    categoria: ["test"],
    articulo_referencia: "Test Article",
    feedback: {
      cita_literal: "Test citation",
      explicacion_fallo: "Test explanation",
    },
    answers: [
      { letter: "A", text: "Wrong answer 1", isCorrect: correctIndex === 0 },
      { letter: "B", text: "Wrong answer 2", isCorrect: correctIndex === 1 },
      { letter: "C", text: "Correct answer", isCorrect: correctIndex === 2 },
      { letter: "D", text: "Wrong answer 3", isCorrect: correctIndex === 3 },
    ],
  };
}

function createMockQuestions(count: number): Question[] {
  // Questions 1..count, with correct answer at index 2 (C)
  return Array.from({ length: count }, (_, i) => createMockQuestion(i + 1, 2));
}

function createFreeAttempt(id: string): FreeAttempt {
  return {
    id,
    type: "free",
    createdAt: new Date().toISOString(),
    sourceExamIds: ["exam-1"],
    config: {},
  };
}

function createSimulacroAttempt(id: string): SimulacroAttempt {
  return {
    id,
    type: "simulacro",
    createdAt: new Date().toISOString(),
    sourceExamIds: ["exam-1"],
    config: {
      questionCount: 60,
      timeLimitMs: 600000, // 10 minutes
      penalty: 0,
      reward: 1,
      examWeights: { "exam-1": 1 },
    },
  };
}

function createReviewAttempt(id: string): ReviewAttempt {
  return {
    id,
    type: "review",
    createdAt: new Date().toISOString(),
    sourceExamIds: ["exam-1"],
    config: {
      questionCount: 60,
      weights: {
        wrongWeight: 2,
        blankWeight: 1.2,
        recoveryWeight: 1,
        weakTimeThresholdMs: 15000,
      },
    },
  };
}

// ============================================================================
// Test Suite
// ============================================================================

describe("AttemptRunner", () => {
  describe("Free Attempt", () => {
    it("should load all questions for free attempt", () => {
      const attempt = createFreeAttempt("free-1");
      const questions = createMockQuestions(10);
      const runner = new AttemptRunner(attempt, questions);

      const state = runner.start();

      expect(state.questions).toHaveLength(10);
      expect(state.attemptType).toBe("free");
    });

    it("should maintain question order (no internal shuffling)", () => {
      const attempt = createFreeAttempt("free-2");
      const questions = createMockQuestions(5);
      const runner = new AttemptRunner(attempt, questions);

      const state = runner.start();

      expect(state.questions[0].number).toBe(1);
      expect(state.questions[4].number).toBe(5);
    });
  });

  describe("Simulacro Attempt", () => {
    it("should respect questionCount limit", () => {
      const attempt = createSimulacroAttempt("sim-1");
      const questions = createMockQuestions(100);
      const runner = new AttemptRunner(attempt, questions, { questionCount: 60 });

      const state = runner.start();

      expect(state.questions).toHaveLength(60);
      expect(state.attemptType).toBe("simulacro");
    });

    it("should slice from beginning when limiting questions", () => {
      const attempt = createSimulacroAttempt("sim-2");
      const questions = createMockQuestions(20);
      const runner = new AttemptRunner(attempt, questions, { questionCount: 10 });

      const state = runner.start();

      expect(state.questions[0].number).toBe(1);
      expect(state.questions[9].number).toBe(10);
    });

    it("should use all questions if questionCount exceeds available", () => {
      const attempt = createSimulacroAttempt("sim-3");
      const questions = createMockQuestions(10);
      const runner = new AttemptRunner(attempt, questions, { questionCount: 50 });

      const state = runner.start();

      expect(state.questions).toHaveLength(10);
    });
  });

  describe("Review Attempt", () => {
    it("should load injected question set as-is", () => {
      const attempt = createReviewAttempt("review-1");
      const questions = createMockQuestions(5).slice(0, 3); // Simulate filtered set
      const runner = new AttemptRunner(attempt, questions);

      const state = runner.start();

      expect(state.questions).toHaveLength(3);
      expect(state.attemptType).toBe("review");
    });
  });

  describe("submitAnswer", () => {
    it("should update state deterministically", () => {
      const attempt = createFreeAttempt("ans-1");
      const questions = createMockQuestions(3);
      const runner = new AttemptRunner(attempt, questions);

      runner.start();
      const state1 = runner.submitAnswer(2); // Correct answer (index 2)

      expect(state1.answers[1]).toEqual({
        selectedIndex: 2,
        isCorrect: true,
      });
    });

    it("should track incorrect answers", () => {
      const attempt = createFreeAttempt("ans-2");
      const questions = createMockQuestions(3);
      const runner = new AttemptRunner(attempt, questions);

      runner.start();
      const state = runner.submitAnswer(0); // Wrong answer (index 0)

      expect(state.answers[1]).toEqual({
        selectedIndex: 0,
        isCorrect: false,
      });
    });

    it("should track blank answers (null)", () => {
      const attempt = createFreeAttempt("ans-3");
      const questions = createMockQuestions(3);
      const runner = new AttemptRunner(attempt, questions);

      runner.start();
      const state = runner.submitAnswer(null); // Blank

      expect(state.answers[1]).toEqual({
        selectedIndex: null,
        isCorrect: false,
      });
    });

    it("should store answers by question number, not index", () => {
      const attempt = createFreeAttempt("ans-4");
      const questions = createMockQuestions(5);
      const runner = new AttemptRunner(attempt, questions);

      runner.start();
      runner.submitAnswer(2);
      runner.next();
      runner.submitAnswer(0);

      const state = runner.getState();

      expect(state.answers[1]).toBeDefined(); // Question number 1
      expect(state.answers[2]).toBeDefined(); // Question number 2
    });

    it("should throw if attempt not started", () => {
      const attempt = createFreeAttempt("ans-5");
      const questions = createMockQuestions(3);
      const runner = new AttemptRunner(attempt, questions);

      expect(() => runner.submitAnswer(2)).toThrow("not started");
    });

    it("should throw on invalid answer index", () => {
      const attempt = createFreeAttempt("ans-6");
      const questions = createMockQuestions(3);
      const runner = new AttemptRunner(attempt, questions);

      runner.start();
      expect(() => runner.submitAnswer(99)).toThrow("Invalid answer index");
    });
  });

  describe("next()", () => {
    it("should increment currentIndex", () => {
      const attempt = createFreeAttempt("next-1");
      const questions = createMockQuestions(5);
      const runner = new AttemptRunner(attempt, questions);

      runner.start();
      const state = runner.next();

      expect(state.currentIndex).toBe(1);
    });

    it("should not overflow past last question", () => {
      const attempt = createFreeAttempt("next-2");
      const questions = createMockQuestions(3);
      const runner = new AttemptRunner(attempt, questions);

      runner.start();
      runner.next();
      runner.next();
      const state1 = runner.next(); // At last question
      expect(state1.currentIndex).toBe(2);

      const state2 = runner.next(); // Try to go past
      expect(state2.currentIndex).toBe(2); // Stays at 2
    });
  });

  describe("finish()", () => {
    it("should produce correct scoring snapshot", () => {
      const attempt = createFreeAttempt("fin-1");
      const questions = createMockQuestions(5);
      const runner = new AttemptRunner(attempt, questions);

      runner.start();
      runner.submitAnswer(2); // Correct (Q1)
      runner.next();
      runner.submitAnswer(2); // Correct (Q2)
      runner.next();
      runner.submitAnswer(0); // Wrong (Q3)
      runner.next();
      runner.submitAnswer(null); // Blank (Q4)
      // Q5 unanswered -> blank

      const state = runner.finish();

      expect(state.isFinished).toBe(true);
      expect(state.result).toEqual({
        correct: 2,
        wrong: 1,
        blank: 2,
        score: 40, // 2/5 = 40%
        percentage: 40,
      });
    });

    it("should mark all unanswered questions as blank", () => {
      const attempt = createFreeAttempt("fin-2");
      const questions = createMockQuestions(3);
      const runner = new AttemptRunner(attempt, questions);

      runner.start();
      // Answer nothing
      const state = runner.finish();

      expect(state.result?.blank).toBe(3);
      expect(state.result?.correct).toBe(0);
      expect(state.result?.percentage).toBe(0);
    });

    it("should return same state if already finished", () => {
      const attempt = createFreeAttempt("fin-3");
      const questions = createMockQuestions(3);
      const runner = new AttemptRunner(attempt, questions);

      runner.start();
      runner.submitAnswer(2);
      const state1 = runner.finish();
      const state2 = runner.finish();

      expect(state2).toEqual(state1);
    });
  });

  describe("State immutability", () => {
    it("cannot submitAnswer after finish", () => {
      const attempt = createFreeAttempt("imm-1");
      const questions = createMockQuestions(3);
      const runner = new AttemptRunner(attempt, questions);

      runner.start();
      runner.submitAnswer(2);
      runner.finish();

      expect(() => runner.submitAnswer(2)).toThrow("already finished");
    });

    it("getState returns immutable snapshot", () => {
      const attempt = createFreeAttempt("imm-2");
      const questions = createMockQuestions(3);
      const runner = new AttemptRunner(attempt, questions);

      runner.start();
      const state1 = runner.getState();
      runner.submitAnswer(2);
      const state2 = runner.getState();

      expect(state1.answers).not.toBe(state2.answers);
      expect(state1.answers[1]).toBeUndefined();
      expect(state2.answers[1]).toBeDefined();
    });
  });

  describe("start()", () => {
    it("should set startedAt timestamp", () => {
      const attempt = createFreeAttempt("start-1");
      const questions = createMockQuestions(3);
      const runner = new AttemptRunner(attempt, questions);

      const before = Date.now();
      const state = runner.start();
      const after = Date.now();

      expect(state.startedAt).toBeGreaterThanOrEqual(before);
      expect(state.startedAt).toBeLessThanOrEqual(after);
    });

    it("should set remainingTimeMs if config has timeLimitMs", () => {
      const attempt = createSimulacroAttempt("start-2");
      const questions = createMockQuestions(10);
      const runner = new AttemptRunner(attempt, questions, { timeLimitMs: 600000 });

      const state = runner.start();

      expect(state.remainingTimeMs).toBe(600000);
    });

    it("should not set remainingTimeMs if no time limit", () => {
      const attempt = createFreeAttempt("start-3");
      const questions = createMockQuestions(3);
      const runner = new AttemptRunner(attempt, questions);

      const state = runner.start();

      expect(state.remainingTimeMs).toBeUndefined();
    });
  });

  describe("Telemetry Integration", () => {
    it("free attempt produces no telemetry updates", () => {
      const attempt = createFreeAttempt("tel-free");
      const questions = createMockQuestions(3);
      const runner = new AttemptRunner(attempt, questions);

      runner.start();
      runner.submitAnswer(2);
      runner.next();
      runner.submitAnswer(0);

      const updates = runner.getPendingTelemetryUpdates();
      expect(updates).toHaveLength(0);
    });

    it("simulacro generates telemetry updates", () => {
      const attempt = createSimulacroAttempt("tel-sim");
      const questions = createMockQuestions(3);
      const runner = new AttemptRunner(attempt, questions);

      runner.start();
      runner.submitAnswer(2); // Correct

      const updates = runner.getPendingTelemetryUpdates();
      expect(updates).toHaveLength(1);
      expect(updates[0].examId).toBe("exam-1");
      expect(updates[0].questionNumber).toBe(1);
      expect(updates[0].next.timesCorrect).toBe(1);
      expect(updates[0].next.totalSeen).toBe(1);
    });

    it("review generates telemetry updates", () => {
      const attempt = createReviewAttempt("tel-rev");
      const questions = createMockQuestions(3);
      const runner = new AttemptRunner(attempt, questions);

      runner.start();
      runner.submitAnswer(2);

      const updates = runner.getPendingTelemetryUpdates();
      expect(updates).toHaveLength(1);
      expect(updates[0].next.totalSeen).toBe(1);
    });

    it("wrong answer increments timesWrong", () => {
      const attempt = createSimulacroAttempt("tel-wrong");
      const questions = createMockQuestions(3);
      const runner = new AttemptRunner(attempt, questions);

      runner.start();
      runner.submitAnswer(0); // Wrong answer

      const updates = runner.getPendingTelemetryUpdates();
      expect(updates[0].next.timesWrong).toBe(1);
      expect(updates[0].next.timesCorrect).toBe(0);
      expect(updates[0].next.consecutiveCorrect).toBe(0);
    });

    it("blank answer increments timesBlank", () => {
      const attempt = createSimulacroAttempt("tel-blank");
      const questions = createMockQuestions(3);
      const runner = new AttemptRunner(attempt, questions);

      runner.start();
      runner.submitAnswer(null); // Blank

      const updates = runner.getPendingTelemetryUpdates();
      expect(updates[0].next.timesBlank).toBe(1);
      expect(updates[0].next.timesCorrect).toBe(0);
      expect(updates[0].next.consecutiveCorrect).toBe(0);
    });

    it("correct answer increments consecutiveCorrect for same question", () => {
      // Simulate answering the same question correctly twice (review mode scenario)
      const existingTelemetry: QuestionTelemetry = {
        id: "exam-1::1",
        examId: "exam-1",
        questionNumber: 1,
        timesCorrect: 1,
        timesWrong: 0,
        timesBlank: 0,
        consecutiveCorrect: 1,
        avgResponseTimeMs: 5000,
        totalSeen: 1,
        lastSeenAt: new Date().toISOString(),
      };

      const attempt = createSimulacroAttempt("tel-consec");
      const questions = createMockQuestions(3);
      const runner = new AttemptRunner(attempt, questions, {
        getTelemetry: () => existingTelemetry,
      });

      runner.start();
      runner.submitAnswer(2); // Correct again

      const updates = runner.getPendingTelemetryUpdates();
      expect(updates[0].previous?.consecutiveCorrect).toBe(1);
      expect(updates[0].next.consecutiveCorrect).toBe(2);
    });

    it("wrong answer resets consecutiveCorrect", () => {
      // Pre-populate with existing telemetry showing 3 consecutive correct
      const existingTelemetry: QuestionTelemetry = {
        id: "exam-1::1",
        examId: "exam-1",
        questionNumber: 1,
        timesCorrect: 3,
        timesWrong: 0,
        timesBlank: 0,
        consecutiveCorrect: 3,
        avgResponseTimeMs: 5000,
        totalSeen: 3,
        lastSeenAt: new Date().toISOString(),
      };

      const attempt = createSimulacroAttempt("tel-reset");
      const questions = createMockQuestions(3);
      const runner = new AttemptRunner(attempt, questions, {
        getTelemetry: () => existingTelemetry,
      });

      runner.start();
      runner.submitAnswer(0); // Wrong answer

      const updates = runner.getPendingTelemetryUpdates();
      expect(updates[0].previous?.consecutiveCorrect).toBe(3);
      expect(updates[0].next.consecutiveCorrect).toBe(0);
      expect(updates[0].next.timesWrong).toBe(1);
    });

    it("telemetry buffer includes previous state when available", () => {
      const existingTelemetry: QuestionTelemetry = {
        id: "exam-1::1",
        examId: "exam-1",
        questionNumber: 1,
        timesCorrect: 5,
        timesWrong: 2,
        timesBlank: 0,
        consecutiveCorrect: 3,
        avgResponseTimeMs: 8000,
        totalSeen: 7,
        lastSeenAt: new Date().toISOString(),
      };

      const attempt = createSimulacroAttempt("tel-prev");
      const questions = createMockQuestions(3);
      const runner = new AttemptRunner(attempt, questions, {
        getTelemetry: (examId, qNum) =>
          examId === "exam-1" && qNum === 1 ? existingTelemetry : undefined,
      });

      runner.start();
      runner.submitAnswer(2);

      const updates = runner.getPendingTelemetryUpdates();
      expect(updates[0].previous).toEqual(existingTelemetry);
      expect(updates[0].next.totalSeen).toBe(8); // Incremented
      expect(updates[0].next.timesCorrect).toBe(6); // Incremented
    });

    it("telemetry buffer shows undefined previous for new questions", () => {
      const attempt = createSimulacroAttempt("tel-new");
      const questions = createMockQuestions(3);
      const runner = new AttemptRunner(attempt, questions);

      runner.start();
      runner.submitAnswer(2);

      const updates = runner.getPendingTelemetryUpdates();
      expect(updates[0].previous).toBeUndefined();
      expect(updates[0].next.totalSeen).toBe(1);
    });

    it("getPendingTelemetryUpdates does not clear buffer", () => {
      const attempt = createSimulacroAttempt("tel-peek");
      const questions = createMockQuestions(3);
      const runner = new AttemptRunner(attempt, questions);

      runner.start();
      runner.submitAnswer(2);

      const updates1 = runner.getPendingTelemetryUpdates();
      const updates2 = runner.getPendingTelemetryUpdates();

      expect(updates1).toHaveLength(1);
      expect(updates2).toHaveLength(1);
    });

    it("consumeTelemetryUpdates clears buffer", () => {
      const attempt = createSimulacroAttempt("tel-consume");
      const questions = createMockQuestions(3);
      const runner = new AttemptRunner(attempt, questions);

      runner.start();
      runner.submitAnswer(2);
      runner.next();
      runner.submitAnswer(0);

      const updates = runner.consumeTelemetryUpdates();
      expect(updates).toHaveLength(2);

      const remaining = runner.getPendingTelemetryUpdates();
      expect(remaining).toHaveLength(0);
    });

    it("tracks response time in telemetry", async () => {
      const attempt = createSimulacroAttempt("tel-time");
      const questions = createMockQuestions(3);
      const runner = new AttemptRunner(attempt, questions);

      runner.start();

      // Small delay to ensure measurable response time
      await new Promise((r) => setTimeout(r, 10));

      runner.submitAnswer(2);

      const updates = runner.getPendingTelemetryUpdates();
      expect(updates[0].next.avgResponseTimeMs).toBeGreaterThan(0);
    });

    it("updates lastSeenAt timestamp", () => {
      const before = new Date().toISOString();

      const attempt = createSimulacroAttempt("tel-time");
      const questions = createMockQuestions(3);
      const runner = new AttemptRunner(attempt, questions);

      runner.start();
      runner.submitAnswer(2);

      const updates = runner.getPendingTelemetryUpdates();
      const after = new Date().toISOString();

      expect(updates[0].next.lastSeenAt >= before).toBe(true);
      expect(updates[0].next.lastSeenAt <= after).toBe(true);
    });
  });

  describe("Timer (Simulacro Only)", () => {
    it("should initialize remainingTimeMs for simulacro", () => {
      const attempt = createSimulacroAttempt("timer-init");
      const questions = createMockQuestions(10);
      const runner = new AttemptRunner(attempt, questions, { timeLimitMs: 600000 });

      const state = runner.start();

      expect(state.remainingTimeMs).toBe(600000);
    });

    it("should not initialize remainingTimeMs for free mode", () => {
      const attempt = createFreeAttempt("timer-free");
      const questions = createMockQuestions(10);
      const runner = new AttemptRunner(attempt, questions);

      const state = runner.start();

      expect(state.remainingTimeMs).toBeUndefined();
    });

    it("should not initialize remainingTimeMs for review mode", () => {
      const attempt = createReviewAttempt("timer-review");
      const questions = createMockQuestions(10);
      const runner = new AttemptRunner(attempt, questions);

      const state = runner.start();

      expect(state.remainingTimeMs).toBeUndefined();
    });

    it("should decrease remainingTimeMs deterministically", () => {
      const attempt = createSimulacroAttempt("timer-tick");
      const questions = createMockQuestions(10);
      const runner = new AttemptRunner(attempt, questions, { timeLimitMs: 600000 });

      runner.start();
      const state1 = runner.tick(5000);
      expect(state1.remainingTimeMs).toBe(595000);

      const state2 = runner.tick(10000);
      expect(state2.remainingTimeMs).toBe(585000);
    });

    it("should clamp remainingTimeMs at zero", () => {
      const attempt = createSimulacroAttempt("timer-clamp");
      const questions = createMockQuestions(10);
      const runner = new AttemptRunner(attempt, questions, { timeLimitMs: 10000 });

      runner.start();
      const state = runner.tick(15000); // Tick more than remaining

      expect(state.remainingTimeMs).toBe(0);
    });

    it("should auto-finish when time reaches zero", () => {
      const attempt = createSimulacroAttempt("timer-finish");
      const questions = createMockQuestions(5);
      const runner = new AttemptRunner(attempt, questions, { timeLimitMs: 10000 });

      runner.start();
      const state = runner.tick(10000);

      expect(state.isFinished).toBe(true);
      expect(state.result).toBeDefined();
      expect(state.result?.correct).toBe(0);
      expect(state.result?.blank).toBe(5); // All unanswered = blank
    });

    it("should not accept answers after timer expiry", () => {
      const attempt = createSimulacroAttempt("timer-lock");
      const questions = createMockQuestions(5);
      const runner = new AttemptRunner(attempt, questions, { timeLimitMs: 10000 });

      runner.start();
      runner.tick(10000); // Time expires, auto-finishes

      expect(() => runner.submitAnswer(2)).toThrow("already finished");
    });

    it("should not allow next() after timer expiry", () => {
      const attempt = createSimulacroAttempt("timer-next-lock");
      const questions = createMockQuestions(5);
      const runner = new AttemptRunner(attempt, questions, { timeLimitMs: 10000 });

      runner.start();
      runner.tick(10000); // Time expires

      const state = runner.next();
      expect(state.isFinished).toBe(true);
      expect(state.currentIndex).toBe(0); // No change
    });

    it("should accumulate multiple tick() calls", () => {
      const attempt = createSimulacroAttempt("timer-accum");
      const questions = createMockQuestions(10);
      const runner = new AttemptRunner(attempt, questions, { timeLimitMs: 60000 });

      runner.start();
      runner.tick(10000);
      runner.tick(20000);
      runner.tick(5000);
      const state = runner.getState();

      expect(state.remainingTimeMs).toBe(25000); // 60000 - 35000
    });

    it("should be deterministic: tick(5000)+tick(5000) equals tick(10000)", () => {
      const attempt1 = createSimulacroAttempt("timer-det1");
      const attempt2 = createSimulacroAttempt("timer-det2");
      const questions = createMockQuestions(5);

      // Runner 1: Two 5-second ticks
      const runner1 = new AttemptRunner(attempt1, questions, { timeLimitMs: 60000 });
      runner1.start();
      runner1.tick(5000);
      runner1.tick(5000);
      const state1 = runner1.getState();

      // Runner 2: One 10-second tick
      const runner2 = new AttemptRunner(attempt2, questions, { timeLimitMs: 60000 });
      runner2.start();
      runner2.tick(10000);
      const state2 = runner2.getState();

      expect(state1.remainingTimeMs).toBe(state2.remainingTimeMs);
      expect(state1.remainingTimeMs).toBe(50000); // 60000 - 10000
    });

    it("should ignore tick() for free attempts", () => {
      const attempt = createFreeAttempt("timer-free-ignore");
      const questions = createMockQuestions(5);
      const runner = new AttemptRunner(attempt, questions);

      runner.start();
      const state = runner.tick(5000);

      expect(state.remainingTimeMs).toBeUndefined();
      expect(state.isFinished).toBe(false);
    });

    it("should ignore tick() for review attempts", () => {
      const attempt = createReviewAttempt("timer-review-ignore");
      const questions = createMockQuestions(5);
      const runner = new AttemptRunner(attempt, questions);

      runner.start();
      const state = runner.tick(5000);

      expect(state.remainingTimeMs).toBeUndefined();
      expect(state.isFinished).toBe(false);
    });

    it("should throw on negative deltaMs", () => {
      const attempt = createSimulacroAttempt("timer-negative");
      const questions = createMockQuestions(5);
      const runner = new AttemptRunner(attempt, questions, { timeLimitMs: 60000 });

      runner.start();
      expect(() => runner.tick(-1000)).toThrow("deltaMs must be non-negative");
    });

    it("should not tick further after already finished", () => {
      const attempt = createSimulacroAttempt("timer-no-double-finish");
      const questions = createMockQuestions(5);
      const runner = new AttemptRunner(attempt, questions, { timeLimitMs: 10000 });

      runner.start();
      const state1 = runner.tick(10000); // Expires and finishes
      expect(state1.isFinished).toBe(true);

      const state2 = runner.tick(5000); // Try to tick again
      expect(state2.isFinished).toBe(true);
      expect(state2.remainingTimeMs).toBe(0);
    });

    it("should generate telemetry updates on auto-finish", () => {
      const attempt = createSimulacroAttempt("timer-telemetry");
      const questions = createMockQuestions(3);
      const runner = new AttemptRunner(attempt, questions, { timeLimitMs: 5000 });

      runner.start();
      // Answer one question before timeout
      runner.submitAnswer(2);
      runner.next();

      // Let timer expire
      runner.tick(5000);

      const updates = runner.getPendingTelemetryUpdates();
      expect(updates.length).toBeGreaterThan(0);
      expect(updates[0].next.totalSeen).toBe(1);
    });

    it("should finish with correct scoring after partial answers", () => {
      const attempt = createSimulacroAttempt("timer-partial");
      const questions = createMockQuestions(5);
      const runner = new AttemptRunner(attempt, questions, { timeLimitMs: 10000 });

      runner.start();
      runner.submitAnswer(2); // Correct (Q1)
      runner.next();
      runner.submitAnswer(0); // Wrong (Q2)

      // Time expires
      const state = runner.tick(10000);

      expect(state.isFinished).toBe(true);
      expect(state.result?.correct).toBe(1);
      expect(state.result?.wrong).toBe(1);
      expect(state.result?.blank).toBe(3); // Q3, Q4, Q5 unanswered
    });
  });
});
