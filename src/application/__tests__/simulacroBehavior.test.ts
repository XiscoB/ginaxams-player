/**
 * Simulacro Behavior Regression Tests
 *
 * Protects against:
 * - Simulacro showing feedback when showExplanations is false
 * - Simulacro leaking isCorrect on answers before finish
 * - Timer expiration not auto-finalizing attempt
 * - Progress state inconsistencies
 *
 * Tests operate through AttemptController and ViewState contracts.
 * No DOM, CSS, or HTML testing.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { AttemptController } from "../attemptController.js";
import type { AnswerViewWithResult } from "../viewState.js";
import type {
  StoredExam,
  Exam,
  Question,
  Attempt,
  QuestionTelemetry,
  ExportData,
} from "../../domain/types.js";
import type { ExamStorage } from "../../storage/db.js";

// ============================================================================
// Test Fixtures
// ============================================================================

function createTestQuestion(num: number, correctIndex: number = 0): Question {
  return {
    number: num,
    text: `Question ${num}`,
    categoria: ["cat-1"],
    articulo_referencia: `Article ${num}`,
    feedback: {
      cita_literal: `Citation for question ${num}`,
      explicacion_fallo: `Explanation for question ${num}`,
    },
    answers: [
      { letter: "A", text: "Answer A", isCorrect: correctIndex === 0 },
      { letter: "B", text: "Answer B", isCorrect: correctIndex === 1 },
      { letter: "C", text: "Answer C", isCorrect: correctIndex === 2 },
      { letter: "D", text: "Answer D", isCorrect: correctIndex === 3 },
    ],
  };
}

function createTestExam(questionCount: number = 5): Exam {
  const questions = Array.from({ length: questionCount }, (_, i) =>
    createTestQuestion(i + 1),
  );
  return {
    schema_version: "2.0",
    exam_id: "test-exam-1",
    title: "Test Exam",
    categorias: ["cat-1"],
    total_questions: questionCount,
    questions,
  };
}

function createStoredExam(questionCount: number = 5): StoredExam {
  return {
    id: "stored-exam-1",
    title: "Test Exam",
    data: createTestExam(questionCount),
    addedAt: "2024-01-01T00:00:00.000Z",
    folderId: "uncategorized",
  };
}

function createMockStorage(storedExam: StoredExam): ExamStorage {
  const attempts: Attempt[] = [];
  const telemetry: QuestionTelemetry[] = [];

  return {
    getExam: async (id: string) =>
      id === storedExam.id ? storedExam : undefined,
    getExams: async () => [storedExam],
    saveExam: async () => storedExam.id,
    deleteExam: async () => {},
    saveAttempt: async (a: Attempt) => {
      attempts.push(a);
      return a.id;
    },
    getAttempt: async (id: string) => attempts.find((a) => a.id === id),
    getAllAttempts: async () => attempts,
    getAttemptsByType: async (type: Attempt["type"]) =>
      attempts.filter((a) => a.type === type),
    deleteAttempt: async () => {},
    deleteAttemptsForExam: async () => {},
    saveQuestionTelemetry: async (t: QuestionTelemetry) => {
      telemetry.push(t);
    },
    getTelemetryByExam: async () => telemetry,
    getAllQuestionTelemetry: async () => telemetry,
    deleteTelemetryForExam: async () => {},
    clearAllQuestionTelemetry: async () => {},
    getFolders: async () => [],
    saveFolder: async () => "",
    deleteFolder: async () => {},
    exportData: async (): Promise<ExportData> => ({
      version: 4,
      exportedAt: new Date().toISOString(),
      exams: [storedExam],
      folders: [],
    }),
    ready: async () => ({}) as IDBDatabase,
  } as unknown as ExamStorage;
}

// ============================================================================
// Test Suite
// ============================================================================

describe("Simulacro Behavior", () => {
  let controller: AttemptController;
  let storedExam: StoredExam;

  beforeEach(() => {
    storedExam = createStoredExam(5);
    const storage = createMockStorage(storedExam);
    controller = new AttemptController(storage);
  });

  // --------------------------------------------------------------------------
  // Test 3: Simulacro suppresses feedback when showExplanations = false
  // --------------------------------------------------------------------------

  describe("Simulacro suppresses feedback (showExplanations = false)", () => {
    it("should not show feedback after submitting answer", async () => {
      const viewState = await controller.startAttempt({
        mode: "simulacro",
        examIds: [storedExam.id],
        config: {
          questionCount: 5,
          timeLimitMs: 600000,
          penalty: 0,
          reward: 1,
          showExplanations: false,
        },
      });

      // Initial state: no feedback
      expect(viewState.feedback).toBeUndefined();

      // Submit answer
      const afterSubmit = controller.submitAnswer(0);

      // Feedback must still be undefined
      expect(afterSubmit.feedback).toBeUndefined();
    });

    it("should not expose isCorrect on answers before feedback toggle", async () => {
      await controller.startAttempt({
        mode: "simulacro",
        examIds: [storedExam.id],
        config: {
          questionCount: 5,
          timeLimitMs: 600000,
          penalty: 0,
          reward: 1,
          showExplanations: false,
        },
      });

      // Before answering: answers should be plain AnswerView (no isCorrect)
      const preState = controller.getViewState();
      for (const answer of preState.answers) {
        expect("isCorrect" in answer).toBe(false);
      }
    });

    it("should not expose isCorrect on answers after submission without feedback", async () => {
      await controller.startAttempt({
        mode: "simulacro",
        examIds: [storedExam.id],
        config: {
          questionCount: 5,
          timeLimitMs: 600000,
          penalty: 0,
          reward: 1,
          showExplanations: false,
        },
      });

      // Submit answer
      const afterSubmit = controller.submitAnswer(0);

      // Answers should NOT expose isCorrect when showExplanations is false
      for (const answer of afterSubmit.answers) {
        expect("isCorrect" in answer).toBe(false);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Test 4: Simulacro feedback toggle (showExplanations = true)
  // --------------------------------------------------------------------------

  describe("Simulacro with feedback toggle enabled", () => {
    it("should show feedback after submitting answer when showExplanations = true", async () => {
      await controller.startAttempt({
        mode: "simulacro",
        examIds: [storedExam.id],
        config: {
          questionCount: 5,
          timeLimitMs: 600000,
          penalty: 0,
          reward: 1,
          showExplanations: true,
        },
      });

      const afterSubmit = controller.submitAnswer(0);

      expect(afterSubmit.feedback).toBeDefined();
      expect(afterSubmit.feedback!.isCorrect).toBeDefined();
    });

    it("should expose isCorrect on answers after submission with feedback on", async () => {
      await controller.startAttempt({
        mode: "simulacro",
        examIds: [storedExam.id],
        config: {
          questionCount: 5,
          timeLimitMs: 600000,
          penalty: 0,
          reward: 1,
          showExplanations: true,
        },
      });

      const afterSubmit = controller.submitAnswer(0);

      // Answers should include isCorrect when showExplanations is true
      const answersWithResult = afterSubmit.answers as AnswerViewWithResult[];
      const hasCorrectInfo = answersWithResult.some((a) => "isCorrect" in a);
      expect(hasCorrectInfo).toBe(true);
    });

    it("should still have no feedback before answering even with toggle on", async () => {
      const viewState = await controller.startAttempt({
        mode: "simulacro",
        examIds: [storedExam.id],
        config: {
          questionCount: 5,
          timeLimitMs: 600000,
          penalty: 0,
          reward: 1,
          showExplanations: true,
        },
      });

      expect(viewState.feedback).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // Test 7: Progress State Integrity
  // --------------------------------------------------------------------------

  describe("Progress state integrity", () => {
    it("should start at question 1 with 0 answered", async () => {
      const viewState = await controller.startAttempt({
        mode: "simulacro",
        examIds: [storedExam.id],
        config: {
          questionCount: 5,
          timeLimitMs: 600000,
          penalty: 0,
          reward: 1,
        },
      });

      expect(viewState.progress.current).toBe(1);
      expect(viewState.progress.answered).toBe(0);
      expect(viewState.progress.total).toBeGreaterThan(0);
    });

    it("should increment answered after submitting", async () => {
      await controller.startAttempt({
        mode: "simulacro",
        examIds: [storedExam.id],
        config: {
          questionCount: 5,
          timeLimitMs: 600000,
          penalty: 0,
          reward: 1,
        },
      });

      const afterSubmit = controller.submitAnswer(0);
      expect(afterSubmit.progress.answered).toBe(1);
    });

    it("should increment current after navigating to next question", async () => {
      await controller.startAttempt({
        mode: "simulacro",
        examIds: [storedExam.id],
        config: {
          questionCount: 5,
          timeLimitMs: 600000,
          penalty: 0,
          reward: 1,
          showExplanations: true,
        },
      });

      controller.submitAnswer(0);
      const afterNext = controller.nextQuestion();

      expect(afterNext.progress.current).toBe(2);
    });

    it("should track progress correctly across multiple questions", async () => {
      await controller.startAttempt({
        mode: "simulacro",
        examIds: [storedExam.id],
        config: {
          questionCount: 5,
          timeLimitMs: 600000,
          penalty: 0,
          reward: 1,
          showExplanations: true,
        },
      });

      // Answer and navigate through 3 questions
      for (let i = 0; i < 3; i++) {
        controller.submitAnswer(0);
        if (i < 2) {
          controller.nextQuestion();
        }
      }

      const viewState = controller.getViewState();
      expect(viewState.progress.answered).toBe(3);
      expect(viewState.progress.current).toBe(3);
    });

    it("should track progress correctly in free mode", async () => {
      await controller.startAttempt({
        mode: "free",
        examIds: [storedExam.id],
      });

      // Initial state
      const initial = controller.getViewState();
      expect(initial.progress.current).toBe(1);
      expect(initial.progress.answered).toBe(0);

      // After answering
      controller.submitAnswer(0);
      const afterAnswer = controller.getViewState();
      expect(afterAnswer.progress.answered).toBe(1);

      // After next
      controller.nextQuestion();
      const afterNext = controller.getViewState();
      expect(afterNext.progress.current).toBe(2);
      expect(afterNext.progress.answered).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // Test 8: Timer expiration auto-finalizes attempt
  // --------------------------------------------------------------------------

  describe("Simulacro timer expiration", () => {
    it("should have timer info in simulacro mode", async () => {
      const viewState = await controller.startAttempt({
        mode: "simulacro",
        examIds: [storedExam.id],
        config: {
          questionCount: 5,
          timeLimitMs: 10000, // 10 seconds
          penalty: 0,
          reward: 1,
        },
      });

      expect(viewState.timer).toBeDefined();
      expect(viewState.timer!.totalMs).toBe(10000);
      expect(viewState.timer!.remainingMs).toBe(10000);
    });

    it("should decrease remaining time on tick", async () => {
      await controller.startAttempt({
        mode: "simulacro",
        examIds: [storedExam.id],
        config: {
          questionCount: 5,
          timeLimitMs: 10000,
          penalty: 0,
          reward: 1,
        },
      });

      const afterTick = controller.tick(1000);

      expect(afterTick.timer!.remainingMs).toBe(9000);
    });

    it("should auto-finalize when timer reaches zero", async () => {
      await controller.startAttempt({
        mode: "simulacro",
        examIds: [storedExam.id],
        config: {
          questionCount: 5,
          timeLimitMs: 5000,
          penalty: 0,
          reward: 1,
        },
      });

      // Exhaust the timer
      const afterExpiry = controller.tick(5000);

      expect(afterExpiry.isFinished).toBe(true);
    });

    it("should not have timer in free mode", async () => {
      const viewState = await controller.startAttempt({
        mode: "free",
        examIds: [storedExam.id],
      });

      expect(viewState.timer).toBeUndefined();
    });
  });
});
