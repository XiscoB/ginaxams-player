/**
 * Feedback Behavior Regression Tests
 *
 * Protects against previously observed bugs:
 * - Feedback from previous question appearing before answering
 * - Feedback persisting across questions
 *
 * Tests operate through AttemptController and ViewState contracts.
 * No DOM, CSS, or HTML testing.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { AttemptController } from "../attemptController.js";
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

/**
 * In-memory mock for ExamStorage.
 * Only implements the methods needed by AttemptController.
 */
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

describe("Feedback Behavior", () => {
  let controller: AttemptController;
  let storedExam: StoredExam;

  beforeEach(() => {
    storedExam = createStoredExam(5);
    const storage = createMockStorage(storedExam);
    controller = new AttemptController(storage);
  });

  // --------------------------------------------------------------------------
  // Test 1: Feedback appears only after answer submission
  // --------------------------------------------------------------------------

  describe("Feedback appears only after answer submission", () => {
    it("should have no feedback when question first loads (free mode)", async () => {
      const viewState = await controller.startAttempt({
        mode: "free",
        examIds: [storedExam.id],
      });

      expect(viewState.feedback).toBeUndefined();
      expect(viewState.isAnswered).toBe(false);
    });

    it("should show feedback after submitting an answer (free mode)", async () => {
      await controller.startAttempt({
        mode: "free",
        examIds: [storedExam.id],
      });

      const viewState = controller.submitAnswer(0);

      expect(viewState.feedback).toBeDefined();
      expect(viewState.isAnswered).toBe(true);
    });

    it("should show feedback after submitting a blank answer (free mode)", async () => {
      await controller.startAttempt({
        mode: "free",
        examIds: [storedExam.id],
      });

      const viewState = controller.submitAnswer(null);

      expect(viewState.feedback).toBeDefined();
      expect(viewState.isAnswered).toBe(true);
    });

    it("should have no feedback when question first loads (review mode)", async () => {
      const viewState = await controller.startAttempt({
        mode: "review",
        examIds: [storedExam.id],
      });

      expect(viewState.feedback).toBeUndefined();
      expect(viewState.isAnswered).toBe(false);
    });

    it("should show feedback after submitting an answer (review mode)", async () => {
      await controller.startAttempt({
        mode: "review",
        examIds: [storedExam.id],
      });

      const viewState = controller.submitAnswer(0);

      expect(viewState.feedback).toBeDefined();
      expect(viewState.isAnswered).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Test 2: Feedback resets between questions
  // --------------------------------------------------------------------------

  describe("Feedback resets between questions", () => {
    it("should clear feedback after navigating to next question (free mode)", async () => {
      await controller.startAttempt({
        mode: "free",
        examIds: [storedExam.id],
      });

      // Answer question 1
      const answeredState = controller.submitAnswer(0);
      expect(answeredState.feedback).toBeDefined();

      // Move to next question
      const nextState = controller.nextQuestion();

      expect(nextState.feedback).toBeUndefined();
      expect(nextState.isAnswered).toBe(false);
    });

    it("should clear feedback after navigating to next question (review mode)", async () => {
      await controller.startAttempt({
        mode: "review",
        examIds: [storedExam.id],
      });

      // Answer question 1
      const answeredState = controller.submitAnswer(0);
      expect(answeredState.feedback).toBeDefined();

      // Move to next question
      const nextState = controller.nextQuestion();

      expect(nextState.feedback).toBeUndefined();
      expect(nextState.isAnswered).toBe(false);
    });

    it("should show fresh feedback after answering new question", async () => {
      await controller.startAttempt({
        mode: "free",
        examIds: [storedExam.id],
      });

      // Answer question 1 correctly (index 0 is correct)
      controller.submitAnswer(0);

      // Move to next question
      controller.nextQuestion();

      // Answer question 2 incorrectly (index 1 is wrong)
      const q2State = controller.submitAnswer(1);

      expect(q2State.feedback).toBeDefined();
      expect(q2State.feedback!.isCorrect).toBe(false);
    });

    it("should correctly track feedback across multiple questions", async () => {
      await controller.startAttempt({
        mode: "free",
        examIds: [storedExam.id],
      });

      // Cycle through 3 questions
      for (let i = 0; i < 3; i++) {
        // Before answering: no feedback
        const preState = controller.getViewState();
        expect(preState.feedback).toBeUndefined();

        // Answer
        const answeredState = controller.submitAnswer(0);
        expect(answeredState.feedback).toBeDefined();

        // Move to next (if not last)
        if (i < 2) {
          const nextState = controller.nextQuestion();
          expect(nextState.feedback).toBeUndefined();
        }
      }
    });
  });

  // --------------------------------------------------------------------------
  // Feedback content integrity
  // --------------------------------------------------------------------------

  describe("Feedback content integrity", () => {
    it("should include reference article in feedback", async () => {
      await controller.startAttempt({
        mode: "free",
        examIds: [storedExam.id],
      });

      const viewState = controller.submitAnswer(0);

      expect(viewState.feedback!.referenceArticle).toBeDefined();
      expect(viewState.feedback!.referenceArticle.length).toBeGreaterThan(0);
    });

    it("should include literal citation in feedback", async () => {
      await controller.startAttempt({
        mode: "free",
        examIds: [storedExam.id],
      });

      const viewState = controller.submitAnswer(0);

      expect(viewState.feedback!.literalCitation).toBeDefined();
      expect(viewState.feedback!.literalCitation.length).toBeGreaterThan(0);
    });

    it("should include explanation in feedback", async () => {
      await controller.startAttempt({
        mode: "free",
        examIds: [storedExam.id],
      });

      const viewState = controller.submitAnswer(0);

      expect(viewState.feedback!.explanation).toBeDefined();
      expect(viewState.feedback!.explanation.length).toBeGreaterThan(0);
    });

    it("should correctly indicate correct answer", async () => {
      await controller.startAttempt({
        mode: "free",
        examIds: [storedExam.id],
      });

      // Submit correct answer (index 0)
      const viewState = controller.submitAnswer(0);
      expect(viewState.feedback!.isCorrect).toBe(true);
      expect(viewState.feedback!.correctAnswer).toBe("A");
    });

    it("should correctly indicate wrong answer", async () => {
      await controller.startAttempt({
        mode: "free",
        examIds: [storedExam.id],
      });

      // Submit wrong answer (index 1)
      const viewState = controller.submitAnswer(1);
      expect(viewState.feedback!.isCorrect).toBe(false);
      expect(viewState.feedback!.selectedAnswer).toBe("B");
      expect(viewState.feedback!.correctAnswer).toBe("A");
    });
  });
});
