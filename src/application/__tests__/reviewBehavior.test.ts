/**
 * Review Behavior Regression Tests
 *
 * Protects against:
 * - Review screen missing explanation fields
 * - Results screen missing required statistics
 * - AttemptResultViewState contract violations
 *
 * Tests operate through AttemptController and ViewState contracts.
 * No DOM, CSS, or HTML testing.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { AttemptController } from "../attemptController.js";
import type { AttemptResultViewState } from "../viewState.js";
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

function createTestExam(questionCount: number = 3): Exam {
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

function createStoredExam(questionCount: number = 3): StoredExam {
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

/**
 * Helper: run a complete attempt (answer all questions, then finalize).
 * Returns the result view state.
 */
async function runCompleteAttempt(
  controller: AttemptController,
  storedExam: StoredExam,
  mode: "free" | "simulacro" | "review",
  answerPattern: (questionIndex: number) => number | null,
): Promise<AttemptResultViewState> {
  const config =
    mode === "simulacro"
      ? {
          questionCount: storedExam.data.questions.length,
          timeLimitMs: 600000,
          penalty: 0,
          reward: 1,
          showExplanations: true,
        }
      : undefined;

  await controller.startAttempt({
    mode,
    examIds: [storedExam.id],
    config,
  });

  // Answer all questions
  const questionCount = storedExam.data.questions.length;
  for (let i = 0; i < questionCount; i++) {
    controller.submitAnswer(answerPattern(i));
    if (i < questionCount - 1) {
      controller.nextQuestion();
    }
  }

  return controller.finalizeAttempt();
}

// ============================================================================
// Test Suite
// ============================================================================

describe("Review Behavior", () => {
  let controller: AttemptController;
  let storedExam: StoredExam;

  beforeEach(() => {
    storedExam = createStoredExam(3);
    const storage = createMockStorage(storedExam);
    controller = new AttemptController(storage);
  });

  // --------------------------------------------------------------------------
  // Test 5: Review view contains explanation data
  // --------------------------------------------------------------------------

  describe("Review view contains explanation data", () => {
    it("should include referenceArticle for every question (free mode)", async () => {
      const result = await runCompleteAttempt(
        controller,
        storedExam,
        "free",
        () => 0, // all correct
      );

      for (const q of result.questionSummary) {
        expect(q.referenceArticle).toBeDefined();
        expect(q.referenceArticle!.length).toBeGreaterThan(0);
      }
    });

    it("should include literalCitation for every question", async () => {
      const result = await runCompleteAttempt(
        controller,
        storedExam,
        "free",
        () => 0,
      );

      for (const q of result.questionSummary) {
        expect(q.literalCitation).toBeDefined();
        expect(q.literalCitation!.length).toBeGreaterThan(0);
      }
    });

    it("should include explanation for every question", async () => {
      const result = await runCompleteAttempt(
        controller,
        storedExam,
        "free",
        () => 0,
      );

      for (const q of result.questionSummary) {
        expect(q.explanation).toBeDefined();
        expect(q.explanation!.length).toBeGreaterThan(0);
      }
    });

    it("should include correctAnswerText for every question", async () => {
      const result = await runCompleteAttempt(
        controller,
        storedExam,
        "free",
        () => 0,
      );

      for (const q of result.questionSummary) {
        expect(q.correctAnswerText).toBeDefined();
        expect(q.correctAnswerText.length).toBeGreaterThan(0);
      }
    });

    it("should include correctAnswerLetter for every question", async () => {
      const result = await runCompleteAttempt(
        controller,
        storedExam,
        "free",
        () => 0,
      );

      for (const q of result.questionSummary) {
        expect(q.correctAnswerLetter).toBeDefined();
        expect(q.correctAnswerLetter.length).toBeGreaterThan(0);
      }
    });

    it("should include explanation data in simulacro results", async () => {
      const result = await runCompleteAttempt(
        controller,
        storedExam,
        "simulacro",
        () => 0,
      );

      for (const q of result.questionSummary) {
        expect(q.referenceArticle).toBeDefined();
        expect(q.literalCitation).toBeDefined();
        expect(q.explanation).toBeDefined();
        expect(q.correctAnswerText).toBeDefined();
      }
    });

    it("should include explanation data in review mode results", async () => {
      const result = await runCompleteAttempt(
        controller,
        storedExam,
        "review",
        () => 0,
      );

      for (const q of result.questionSummary) {
        expect(q.referenceArticle).toBeDefined();
        expect(q.literalCitation).toBeDefined();
        expect(q.explanation).toBeDefined();
        expect(q.correctAnswerText).toBeDefined();
      }
    });
  });

  // --------------------------------------------------------------------------
  // Test 6: Results screen contains statistics
  // --------------------------------------------------------------------------

  describe("Results screen contains statistics", () => {
    it("should include totalQuestions in result", async () => {
      const result = await runCompleteAttempt(
        controller,
        storedExam,
        "free",
        () => 0,
      );

      expect(result.totalQuestions).toBe(3);
    });

    it("should include correct count in result", async () => {
      // Answer all correctly (index 0 is correct)
      const result = await runCompleteAttempt(
        controller,
        storedExam,
        "free",
        () => 0,
      );

      expect(result.result.correct).toBe(3);
    });

    it("should include wrong count in result", async () => {
      // Answer all incorrectly (index 1 is wrong)
      const result = await runCompleteAttempt(
        controller,
        storedExam,
        "free",
        () => 1,
      );

      expect(result.result.wrong).toBe(3);
    });

    it("should include blank count in result", async () => {
      // Leave all blank (null)
      const result = await runCompleteAttempt(
        controller,
        storedExam,
        "free",
        () => null,
      );

      expect(result.result.blank).toBe(3);
    });

    it("should include score in result", async () => {
      const result = await runCompleteAttempt(
        controller,
        storedExam,
        "free",
        () => 0,
      );

      expect(result.result.score).toBeDefined();
      expect(typeof result.result.score).toBe("number");
    });

    it("should include percentage in result", async () => {
      const result = await runCompleteAttempt(
        controller,
        storedExam,
        "free",
        () => 0,
      );

      expect(result.result.percentage).toBeDefined();
      expect(typeof result.result.percentage).toBe("number");
      expect(result.result.percentage).toBeGreaterThanOrEqual(0);
      expect(result.result.percentage).toBeLessThanOrEqual(100);
    });

    it("should include timeSpentMs in result", async () => {
      const result = await runCompleteAttempt(
        controller,
        storedExam,
        "free",
        () => 0,
      );

      expect(result.timeSpentMs).toBeDefined();
      expect(typeof result.timeSpentMs).toBe("number");
    });

    it("should compute correct percentage for all correct", async () => {
      const result = await runCompleteAttempt(
        controller,
        storedExam,
        "free",
        () => 0,
      );

      expect(result.result.percentage).toBe(100);
      expect(result.result.correct).toBe(3);
      expect(result.result.wrong).toBe(0);
      expect(result.result.blank).toBe(0);
    });

    it("should compute correct percentage for all wrong", async () => {
      const result = await runCompleteAttempt(
        controller,
        storedExam,
        "free",
        () => 1,
      );

      expect(result.result.percentage).toBe(0);
      expect(result.result.correct).toBe(0);
      expect(result.result.wrong).toBe(3);
    });

    it("should compute mixed results correctly", async () => {
      // First question correct, second wrong, third blank
      const result = await runCompleteAttempt(
        controller,
        storedExam,
        "free",
        (i) => {
          if (i === 0) return 0; // correct
          if (i === 1) return 1; // wrong
          return null; // blank
        },
      );

      expect(result.result.correct).toBe(1);
      expect(result.result.wrong).toBe(1);
      expect(result.result.blank).toBe(1);
      expect(result.totalQuestions).toBe(3);
    });

    it("should include scoreCategory in result", async () => {
      const result = await runCompleteAttempt(
        controller,
        storedExam,
        "free",
        () => 0,
      );

      expect(["good", "medium", "bad"]).toContain(result.scoreCategory);
    });

    it("should include questionSummary with correct count", async () => {
      const result = await runCompleteAttempt(
        controller,
        storedExam,
        "free",
        () => 0,
      );

      expect(result.questionSummary).toHaveLength(3);
    });

    it("should track per-question correctness in summary", async () => {
      const result = await runCompleteAttempt(
        controller,
        storedExam,
        "free",
        (i) => (i === 0 ? 0 : 1), // first correct, rest wrong
      );

      // At least one should be correct and at least one wrong
      const correctQuestions = result.questionSummary.filter(
        (q) => q.isCorrect,
      );
      const wrongQuestions = result.questionSummary.filter(
        (q) => !q.isCorrect && !q.isBlank,
      );

      expect(correctQuestions.length).toBeGreaterThan(0);
      expect(wrongQuestions.length).toBeGreaterThan(0);
    });

    it("should track blank answers in summary", async () => {
      const result = await runCompleteAttempt(
        controller,
        storedExam,
        "free",
        () => null,
      );

      const blankQuestions = result.questionSummary.filter((q) => q.isBlank);
      expect(blankQuestions.length).toBe(3);
    });

    it("should include mode in result view state", async () => {
      const result = await runCompleteAttempt(
        controller,
        storedExam,
        "free",
        () => 0,
      );

      expect(result.mode).toBe("free");
    });

    it("should correctly set mode for simulacro results", async () => {
      const result = await runCompleteAttempt(
        controller,
        storedExam,
        "simulacro",
        () => 0,
      );

      expect(result.mode).toBe("simulacro");
    });
  });
});
