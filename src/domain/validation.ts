/**
 * Validation Layer - Schema v2.0 Strict Validation
 *
 * Pure TypeScript validation with no external dependencies.
 * All validation functions operate on `unknown` and narrow to specific types.
 * Throws descriptive Error instances on validation failure.
 */

import type { Exam, Question, Answer } from "./types.js";

// ============================================================================
// Type Guards
// ============================================================================

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && !Number.isNaN(value);
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validates an Answer object
 * @throws Error with descriptive message if invalid
 */
function validateAnswer(answer: unknown, index: number, questionNumber: number): Answer {
  if (!isObject(answer)) {
    throw new Error(`Question ${questionNumber}: Answer at index ${index} must be an object.`);
  }

  if (!isNonEmptyString(answer.letter)) {
    throw new Error(`Question ${questionNumber}: Answer at index ${index} must have a non-empty 'letter' string.`);
  }

  if (!isNonEmptyString(answer.text)) {
    throw new Error(`Question ${questionNumber}: Answer at index ${index} must have a non-empty 'text' string.`);
  }

  if (typeof answer.isCorrect !== "boolean") {
    throw new Error(`Question ${questionNumber}: Answer at index ${index} must have 'isCorrect' as a boolean.`);
  }

  return {
    letter: answer.letter,
    text: answer.text,
    isCorrect: answer.isCorrect,
  };
}

/**
 * Validates the feedback object
 * @throws Error with descriptive message if invalid
 */
function validateFeedback(
  feedback: unknown,
  questionNumber: number
): { cita_literal: string; explicacion_fallo: string } {
  if (!isObject(feedback)) {
    throw new Error(`Question ${questionNumber}: 'feedback' must be an object.`);
  }

  if (!isNonEmptyString(feedback.cita_literal)) {
    throw new Error(`Question ${questionNumber}: 'feedback.cita_literal' must be a non-empty string.`);
  }

  if (!isNonEmptyString(feedback.explicacion_fallo)) {
    throw new Error(`Question ${questionNumber}: 'feedback.explicacion_fallo' must be a non-empty string.`);
  }

  return {
    cita_literal: feedback.cita_literal,
    explicacion_fallo: feedback.explicacion_fallo,
  };
}

/**
 * Validates a Question object
 * @throws Error with descriptive message if invalid
 */
function validateQuestion(question: unknown, index: number, examCategorias: string[]): Question {
  if (!isObject(question)) {
    throw new Error(`Question at index ${index} must be an object.`);
  }

  // Validate number
  if (!isNumber(question.number)) {
    throw new Error(`Question at index ${index} must have a numeric 'number' field.`);
  }

  const questionNumber = question.number;

  // Validate text
  if (!isNonEmptyString(question.text)) {
    throw new Error(`Question ${questionNumber} must have a non-empty 'text' string.`);
  }

  // Validate categoria
  if (!isArray(question.categoria)) {
    throw new Error(`Question ${questionNumber}: 'categoria' must be an array.`);
  }

  for (let i = 0; i < question.categoria.length; i++) {
    const cat = question.categoria[i];
    if (!isNonEmptyString(cat)) {
      throw new Error(`Question ${questionNumber}: 'categoria[${i}]' must be a non-empty string.`);
    }
    if (!examCategorias.includes(cat)) {
      throw new Error(
        `Question ${questionNumber} has categoria "${cat}" which is not present in exam.categorias.`
      );
    }
  }

  // Validate articulo_referencia
  if (!isNonEmptyString(question.articulo_referencia)) {
    throw new Error(`Question ${questionNumber}: 'articulo_referencia' must be a non-empty string.`);
  }

  // Validate feedback
  if (question.feedback === undefined) {
    throw new Error(`Question ${questionNumber}: 'feedback' is required.`);
  }
  const feedback = validateFeedback(question.feedback, questionNumber);

  // Validate answers
  if (!isArray(question.answers)) {
    throw new Error(`Question ${questionNumber}: 'answers' must be an array.`);
  }

  if (question.answers.length < 2) {
    throw new Error(`Question ${questionNumber} must contain at least 2 answers.`);
  }

  const validatedAnswers: Answer[] = [];
  let correctCount = 0;

  for (let i = 0; i < question.answers.length; i++) {
    const validatedAnswer = validateAnswer(question.answers[i], i, questionNumber);
    validatedAnswers.push(validatedAnswer);
    if (validatedAnswer.isCorrect) {
      correctCount++;
    }
  }

  if (correctCount !== 1) {
    throw new Error(
      `Question ${questionNumber} must contain exactly one correct answer, found ${correctCount}.`
    );
  }

  return {
    number: questionNumber,
    text: question.text,
    categoria: question.categoria as string[],
    articulo_referencia: question.articulo_referencia,
    feedback,
    answers: validatedAnswers,
  };
}

/**
 * Validates that all question categories are valid
 * Must be called after validating categorias array but before validating questions
 */
function validateExamCategorias(categorias: unknown): string[] {
  if (!isArray(categorias)) {
    throw new Error("Exam 'categorias' must be an array.");
  }

  if (categorias.length === 0) {
    throw new Error("Exam must contain at least one categoria.");
  }

  const validatedCategorias: string[] = [];

  for (let i = 0; i < categorias.length; i++) {
    const cat = categorias[i];
    if (!isNonEmptyString(cat)) {
      throw new Error(`Exam 'categorias[${i}]' must be a non-empty string.`);
    }
    validatedCategorias.push(cat);
  }

  return validatedCategorias;
}

// ============================================================================
// Main Validation Entry Point
// ============================================================================

/**
 * Validates an unknown value as a strict Exam schema.
 *
 * @param json - The unknown value to validate (typically parsed JSON)
 * @returns Exam - The validated and narrowed exam object
 * @throws Error - Descriptive error message if validation fails
 *
 * Validation Rules:
 * - Top level must be an object
 * - schema_version must be exactly "2.0"
 * - exam_id must be a non-empty string
 * - title must be a non-empty string
 * - categorias must be a non-empty array of non-empty strings
 * - total_questions must be a number equal to questions.length
 * - questions must be a non-empty array
 * - Each question must have all required fields with correct types
 * - Each question's categoria must be a subset of exam.categorias
 * - Each question must have exactly 2+ answers with exactly 1 correct
 */
export function validateExam(json: unknown): Exam {
  // Top level must be object
  if (!isObject(json)) {
    throw new Error("Exam must be an object.");
  }

  // Validate schema_version
  if (json.schema_version !== "2.0") {
    throw new Error("Invalid schema_version. Expected '2.0'.");
  }

  // Validate exam_id
  if (!isNonEmptyString(json.exam_id)) {
    throw new Error("Exam 'exam_id' must be a non-empty string.");
  }

  // Validate title
  if (!isNonEmptyString(json.title)) {
    throw new Error("Exam 'title' must be a non-empty string.");
  }

  // Validate categorias (do this first so we can validate question categories)
  const categorias = validateExamCategorias(json.categorias);

  // Validate total_questions
  if (!isNumber(json.total_questions)) {
    throw new Error("Exam 'total_questions' must be a number.");
  }

  // Validate questions
  if (!isArray(json.questions)) {
    throw new Error("Exam 'questions' must be an array.");
  }

  if (json.questions.length === 0) {
    throw new Error("Exam must contain at least one question.");
  }

  // Validate each question
  const validatedQuestions: Question[] = [];
  for (let i = 0; i < json.questions.length; i++) {
    const validatedQuestion = validateQuestion(json.questions[i], i, categorias);
    validatedQuestions.push(validatedQuestion);
  }

  // Validate total_questions matches actual count
  if (json.total_questions !== validatedQuestions.length) {
    throw new Error(
      `Exam 'total_questions' (${json.total_questions}) does not match actual question count (${validatedQuestions.length}).`
    );
  }

  // All validations passed - return the narrowed type
  return {
    schema_version: "2.0",
    exam_id: json.exam_id,
    title: json.title,
    categorias,
    total_questions: json.total_questions,
    questions: validatedQuestions,
  };
}

/**
 * Type guard that returns boolean instead of throwing.
 * Use this when you need to check validity without catching errors.
 */
export function isValidExam(json: unknown): json is Exam {
  try {
    validateExam(json);
    return true;
  } catch {
    return false;
  }
}
