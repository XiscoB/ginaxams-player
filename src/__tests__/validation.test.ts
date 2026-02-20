/**
 * Validation module unit tests
 *
 * Tests for strict Exam schema validation.
 * No DOM, No IndexedDB - pure domain logic tests.
 */

import { describe, it, expect } from "vitest";
import { validateExam, isValidExam } from "../domain/validation.js";
import type { Exam, Question, Answer } from "../domain/types.js";

// ============================================================================
// Test Fixtures
// ============================================================================

function createValidAnswer(overrides?: Partial<Answer>): Answer {
  return {
    letter: "A",
    text: "Valid answer text",
    isCorrect: true,
    ...overrides,
  };
}

function createValidQuestion(overrides?: Partial<Question>): Question {
  return {
    number: 1,
    text: "Valid question text",
    categoria: ["TestCategory"],
    articulo_referencia: "Article 1",
    feedback: {
      cita_literal: "Direct citation from source",
      explicacion_fallo: "Explanation of why other answers are wrong",
    },
    answers: [
      createValidAnswer({ letter: "A", isCorrect: true }),
      createValidAnswer({ letter: "B", isCorrect: false }),
      createValidAnswer({ letter: "C", isCorrect: false }),
      createValidAnswer({ letter: "D", isCorrect: false }),
    ],
    ...overrides,
  };
}

function createValidExam(overrides?: Partial<Exam>): Exam {
  return {
    schema_version: "2.0",
    exam_id: "test-exam-001",
    title: "Test Exam",
    categorias: ["TestCategory"],
    total_questions: 1,
    questions: [createValidQuestion()],
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("validateExam", () => {
  describe("valid exam passes", () => {
    it("accepts a minimal valid exam", () => {
      const exam = createValidExam();
      const result = validateExam(exam);
      expect(result).toEqual(exam);
      expect(result.schema_version).toBe("2.0");
    });

    it("accepts an exam with multiple questions", () => {
      const exam = createValidExam({
        total_questions: 2,
        questions: [
          createValidQuestion({ number: 1 }),
          createValidQuestion({ number: 2, categoria: ["TestCategory"] }),
        ],
      });
      const result = validateExam(exam);
      expect(result.questions).toHaveLength(2);
    });

    it("accepts an exam with multiple categorias", () => {
      const exam = createValidExam({
        categorias: ["CategoryA", "CategoryB"],
        questions: [
          createValidQuestion({ categoria: ["CategoryA"] }),
        ],
      });
      const result = validateExam(exam);
      expect(result.categorias).toEqual(["CategoryA", "CategoryB"]);
    });

    it("accepts question with multiple categorias", () => {
      const exam = createValidExam({
        categorias: ["CatA", "CatB"],
        questions: [
          createValidQuestion({ categoria: ["CatA", "CatB"] }),
        ],
      });
      const result = validateExam(exam);
      expect(result.questions[0]?.categoria).toEqual(["CatA", "CatB"]);
    });
  });

  describe("schema_version validation", () => {
    it("throws for missing schema_version", () => {
      const exam = { ...createValidExam(), schema_version: undefined };
      expect(() => validateExam(exam)).toThrow("Invalid schema_version. Expected '2.0'.");
    });

    it("throws for wrong schema_version", () => {
      const exam = { ...createValidExam(), schema_version: "1.0" };
      expect(() => validateExam(exam)).toThrow("Invalid schema_version. Expected '2.0'.");
    });

    it("throws for non-string schema_version", () => {
      const exam = { ...createValidExam(), schema_version: 2.0 };
      expect(() => validateExam(exam)).toThrow("Invalid schema_version. Expected '2.0'.");
    });
  });

  describe("top-level field validation", () => {
    it("throws for non-object input", () => {
      expect(() => validateExam(null)).toThrow("Exam must be an object.");
      expect(() => validateExam("string")).toThrow("Exam must be an object.");
      expect(() => validateExam(123)).toThrow("Exam must be an object.");
      expect(() => validateExam([])).toThrow("Exam must be an object.");
    });

    it("throws for missing exam_id", () => {
      const exam = { ...createValidExam(), exam_id: undefined };
      expect(() => validateExam(exam)).toThrow("Exam 'exam_id' must be a non-empty string.");
    });

    it("throws for empty exam_id", () => {
      const exam = { ...createValidExam(), exam_id: "" };
      expect(() => validateExam(exam)).toThrow("Exam 'exam_id' must be a non-empty string.");
    });

    it("throws for missing title", () => {
      const exam = { ...createValidExam(), title: undefined };
      expect(() => validateExam(exam)).toThrow("Exam 'title' must be a non-empty string.");
    });

    it("throws for empty title", () => {
      const exam = { ...createValidExam(), title: "" };
      expect(() => validateExam(exam)).toThrow("Exam 'title' must be a non-empty string.");
    });

    it("throws for missing categorias", () => {
      const exam = { ...createValidExam(), categorias: undefined };
      expect(() => validateExam(exam)).toThrow("Exam 'categorias' must be an array.");
    });

    it("throws for empty categorias array", () => {
      const exam = { ...createValidExam(), categorias: [] };
      expect(() => validateExam(exam)).toThrow("Exam must contain at least one categoria.");
    });

    it("throws for categorias with empty strings", () => {
      const exam = { ...createValidExam(), categorias: [""] };
      expect(() => validateExam(exam)).toThrow("Exam 'categorias[0]' must be a non-empty string.");
    });

    it("throws for missing total_questions", () => {
      const exam = { ...createValidExam(), total_questions: undefined };
      expect(() => validateExam(exam)).toThrow("Exam 'total_questions' must be a number.");
    });

    it("throws for non-number total_questions", () => {
      const exam = { ...createValidExam(), total_questions: "5" };
      expect(() => validateExam(exam)).toThrow("Exam 'total_questions' must be a number.");
    });

    it("throws for missing questions", () => {
      const exam = { ...createValidExam(), questions: undefined };
      expect(() => validateExam(exam)).toThrow("Exam 'questions' must be an array.");
    });

    it("throws for empty questions array", () => {
      const exam = { ...createValidExam(), questions: [], total_questions: 0 };
      expect(() => validateExam(exam)).toThrow("Exam must contain at least one question.");
    });

    it("throws for total_questions mismatch", () => {
      const exam = createValidExam({
        total_questions: 5,
        questions: [createValidQuestion()],
      });
      expect(() => validateExam(exam)).toThrow(
        "Exam 'total_questions' (5) does not match actual question count (1)."
      );
    });
  });

  describe("question categoria validation", () => {
    it("throws for question categoria not in exam.categorias", () => {
      const exam = createValidExam({
        categorias: ["AllowedCategory"],
        questions: [
          createValidQuestion({ categoria: ["WrongCategory"] }),
        ],
      });
      expect(() => validateExam(exam)).toThrow(
        'Question 1 has categoria "WrongCategory" which is not present in exam.categorias.'
      );
    });

    it("throws for question with partially invalid categoria", () => {
      const exam = createValidExam({
        categorias: ["AllowedCategory"],
        questions: [
          createValidQuestion({ categoria: ["AllowedCategory", "WrongCategory"] }),
        ],
      });
      expect(() => validateExam(exam)).toThrow(
        'Question 1 has categoria "WrongCategory" which is not present in exam.categorias.'
      );
    });

    it("throws for missing categoria in question", () => {
      const exam = createValidExam({
        questions: [
          { ...createValidQuestion(), categoria: undefined } as unknown as Question,
        ],
      });
      expect(() => validateExam(exam)).toThrow("Question 1: 'categoria' must be an array.");
    });
  });

  describe("feedback validation", () => {
    it("throws for missing feedback", () => {
      const exam = createValidExam({
        questions: [{ ...createValidQuestion(), feedback: undefined } as unknown as Question],
      });
      expect(() => validateExam(exam)).toThrow("Question 1: 'feedback' is required.");
    });

    it("throws for missing cita_literal", () => {
      const exam = createValidExam({
        questions: [
          {
            ...createValidQuestion(),
            feedback: { cita_literal: "", explicacion_fallo: "Valid explanation" },
          },
        ],
      });
      expect(() => validateExam(exam)).toThrow(
        "Question 1: 'feedback.cita_literal' must be a non-empty string."
      );
    });

    it("throws for missing explicacion_fallo", () => {
      const exam = createValidExam({
        questions: [
          {
            ...createValidQuestion(),
            feedback: { cita_literal: "Valid citation", explicacion_fallo: "" },
          },
        ],
      });
      expect(() => validateExam(exam)).toThrow(
        "Question 1: 'feedback.explicacion_fallo' must be a non-empty string."
      );
    });
  });

  describe("answer validation", () => {
    it("throws for less than 2 answers", () => {
      const exam = createValidExam({
        questions: [
          createValidQuestion({
            answers: [createValidAnswer({ isCorrect: true, letter: "A" })],
          }),
        ],
      });
      expect(() => validateExam(exam)).toThrow("Question 1 must contain at least 2 answers.");
    });

    it("throws for no correct answer", () => {
      const exam = createValidExam({
        questions: [
          createValidQuestion({
            answers: [
              createValidAnswer({ letter: "A", isCorrect: false }),
              createValidAnswer({ letter: "B", isCorrect: false }),
            ],
          }),
        ],
      });
      expect(() => validateExam(exam)).toThrow(
        "Question 1 must contain exactly one correct answer, found 0."
      );
    });

    it("throws for multiple correct answers", () => {
      const exam = createValidExam({
        questions: [
          createValidQuestion({
            answers: [
              createValidAnswer({ letter: "A", isCorrect: true }),
              createValidAnswer({ letter: "B", isCorrect: true }),
            ],
          }),
        ],
      });
      expect(() => validateExam(exam)).toThrow(
        "Question 1 must contain exactly one correct answer, found 2."
      );
    });

    it("throws for answer with missing letter", () => {
      const exam = createValidExam({
        questions: [
          createValidQuestion({
            answers: [
              { text: "Valid text", isCorrect: true } as Answer,
              createValidAnswer({ letter: "B", isCorrect: false }),
            ],
          }),
        ],
      });
      expect(() => validateExam(exam)).toThrow(
        "Question 1: Answer at index 0 must have a non-empty 'letter' string."
      );
    });

    it("throws for answer with missing text", () => {
      const exam = createValidExam({
        questions: [
          createValidQuestion({
            answers: [
              { letter: "A", isCorrect: true } as Answer,
              createValidAnswer({ letter: "B", isCorrect: false }),
            ],
          }),
        ],
      });
      expect(() => validateExam(exam)).toThrow(
        "Question 1: Answer at index 0 must have a non-empty 'text' string."
      );
    });

    it("throws for answer with missing isCorrect", () => {
      const exam = createValidExam({
        questions: [
          createValidQuestion({
            answers: [
              { letter: "A", text: "Valid text" } as Answer,
              createValidAnswer({ letter: "B", isCorrect: false }),
            ],
          }),
        ],
      });
      expect(() => validateExam(exam)).toThrow(
        "Question 1: Answer at index 0 must have 'isCorrect' as a boolean."
      );
    });
  });

  describe("question field validation", () => {
    it("throws for missing question number", () => {
      const exam = createValidExam({
        questions: [{ ...createValidQuestion(), number: undefined } as unknown as Question],
      });
      expect(() => validateExam(exam)).toThrow(
        "Question at index 0 must have a numeric 'number' field."
      );
    });

    it("throws for non-numeric question number", () => {
      const exam = createValidExam({
        questions: [{ ...createValidQuestion(), number: "1" } as unknown as Question],
      });
      expect(() => validateExam(exam)).toThrow(
        "Question at index 0 must have a numeric 'number' field."
      );
    });

    it("throws for missing question text", () => {
      const exam = createValidExam({
        questions: [{ ...createValidQuestion(), text: undefined } as unknown as Question],
      });
      expect(() => validateExam(exam)).toThrow("Question 1 must have a non-empty 'text' string.");
    });

    it("throws for empty question text", () => {
      const exam = createValidExam({
        questions: [createValidQuestion({ text: "" })],
      });
      expect(() => validateExam(exam)).toThrow("Question 1 must have a non-empty 'text' string.");
    });

    it("throws for missing articulo_referencia", () => {
      const exam = createValidExam({
        questions: [
          { ...createValidQuestion(), articulo_referencia: undefined } as unknown as Question,
        ],
      });
      expect(() => validateExam(exam)).toThrow(
        "Question 1: 'articulo_referencia' must be a non-empty string."
      );
    });

    it("throws for empty articulo_referencia", () => {
      const exam = createValidExam({
        questions: [createValidQuestion({ articulo_referencia: "" })],
      });
      expect(() => validateExam(exam)).toThrow(
        "Question 1: 'articulo_referencia' must be a non-empty string."
      );
    });
  });
});

describe("isValidExam", () => {
  it("returns true for valid exam", () => {
    const exam = createValidExam();
    expect(isValidExam(exam)).toBe(true);
  });

  it("returns false for invalid exam", () => {
    const exam = { ...createValidExam(), schema_version: "1.0" };
    expect(isValidExam(exam)).toBe(false);
  });

  it("returns false for null", () => {
    expect(isValidExam(null)).toBe(false);
  });

  it("returns false for non-object", () => {
    expect(isValidExam("exam")).toBe(false);
    expect(isValidExam(123)).toBe(false);
    expect(isValidExam([])).toBe(false);
  });
});
