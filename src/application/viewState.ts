/**
 * Application View State Types — UI Contract
 *
 * These types define the serializable view models that the application layer
 * exposes to the UI. The UI receives ONLY these types and must not inspect
 * domain structures directly.
 *
 * Data flow:
 *   UI → Application Layer → Domain Engine → Storage
 *
 * The UI consumes view state and dispatches actions. It never calls domain
 * functions, accesses storage, or manipulates engine state.
 */

import type {
  AttemptType,
  AttemptResult,
  StoredExam,
  Folder,
  Attempt,
  QuestionTelemetry,
} from "../domain/types.js";

// ============================================================================
// Backup Snapshot
// ============================================================================

/** Current snapshot format version */
export const SNAPSHOT_VERSION = 1;

/**
 * Full backup snapshot for export/import.
 *
 * This is the authoritative format for data portability. All backup files
 * must conform to this structure and be validated before restore.
 */
export interface BackupSnapshot {
  /** Snapshot format version (always 1 for now) */
  snapshot_version: number;
  /** IndexedDB schema version at time of export */
  db_version: number;
  /** ISO 8601 timestamp of when the backup was created */
  created_at: string;
  /** All application data */
  data: {
    exams: StoredExam[];
    folders: Folder[];
    attempts: Attempt[];
    questionTelemetry: QuestionTelemetry[];
  };
}

// ============================================================================
// Answer View
// ============================================================================

/**
 * A single answer option as the UI should see it.
 */
export interface AnswerView {
  /** Display letter (A, B, C, ...) */
  letter: string;
  /** Answer text */
  text: string;
  /** Index in the original answers array (used for dispatch) */
  index: number;
}

/**
 * Extended answer view after submission (includes correctness info).
 */
export interface AnswerViewWithResult extends AnswerView {
  /** Whether this answer is the correct one */
  isCorrect: boolean;
  /** Whether the user selected this answer */
  isSelected: boolean;
}

// ============================================================================
// Feedback View
// ============================================================================

/**
 * Feedback payload shown after answering a question.
 * Available in all modes once the question is answered.
 */
export interface FeedbackView {
  /** Whether the user's answer was correct */
  isCorrect: boolean;
  /** The letter the user selected (e.g. "A"), or null if blank */
  selectedAnswer: string | null;
  /** The correct answer letter (e.g. "B") */
  correctAnswer: string;
  /** Reference article for the question */
  referenceArticle: string;
  /** Literal citation from source material */
  literalCitation: string;
  /** Explanation of why the wrong answer is wrong */
  explanation: string;
}

// ============================================================================
// Attempt View State (Primary UI Contract)
// ============================================================================

/**
 * Complete view state for an active attempt.
 * This is the ONLY object the UI should use to render the attempt screen.
 */
export interface AttemptViewState {
  /** Attempt mode */
  mode: AttemptType;

  /** Current question text */
  questionText: string;
  /** Current question number (1-based, from exam) */
  questionNumber: number;
  /** Current question categories */
  questionCategories: string[];

  /** Answer options — before submission these are AnswerView, after they include results */
  answers: AnswerView[] | AnswerViewWithResult[];

  /** Whether the current question has been answered */
  isAnswered: boolean;
  /** The index the user selected (null if blank / not yet answered) */
  selectedAnswerIndex: number | null;

  /** Feedback shown after answering (all modes, only when answered) */
  feedback?: FeedbackView;

  /** Progress through the attempt */
  progress: {
    /** 1-based current question position */
    current: number;
    /** Total questions in this attempt */
    total: number;
    /** Number of questions answered so far */
    answered: number;
  };

  /** Timer info (simulacro only) */
  timer?: {
    /** Remaining time in milliseconds */
    remainingMs: number;
    /** Total time in milliseconds */
    totalMs: number;
  };

  /** Whether the attempt is finished */
  isFinished: boolean;

  /** Whether we can navigate backward */
  canGoPrevious: boolean;
  /** Whether we can navigate forward */
  canGoNext: boolean;
  /** Whether the finish action is available */
  canFinish: boolean;
}

// ============================================================================
// Attempt Result View State
// ============================================================================

/**
 * View state for the attempt results screen.
 */
export interface AttemptResultViewState {
  /** Attempt mode that was completed */
  mode: AttemptType;

  /** Score results */
  result: AttemptResult;

  /** Total number of questions in the attempt */
  totalQuestions: number;

  /** Time spent on the attempt in milliseconds */
  timeSpentMs: number;

  /** Score category for visual styling */
  scoreCategory: "good" | "medium" | "bad";

  /** Per-question summary for review */
  questionSummary: QuestionResultView[];
}

/**
 * Per-question result for the review/results screen.
 */
export interface QuestionResultView {
  /** Question number */
  questionNumber: number;
  /** Question text */
  questionText: string;
  /** Whether the user got it right */
  isCorrect: boolean;
  /** Whether the user left it blank */
  isBlank: boolean;
  /** The answer the user chose (letter), or null if blank */
  selectedAnswerLetter: string | null;
  /** The correct answer letter */
  correctAnswerLetter: string;
  /** The correct answer text */
  correctAnswerText: string;
  /** Reference article for the question */
  referenceArticle?: string;
  /** Literal citation from source material */
  literalCitation?: string;
  /** Explanation of why the wrong answer is wrong */
  explanation?: string;
}

// ============================================================================
// Exam Library View State
// ============================================================================

/**
 * A single exam card in the library view.
 */
export interface ExamCardView {
  /** Storage ID */
  id: string;
  /** Exam title */
  title: string;
  /** Number of questions */
  questionCount: number;
  /** Categories */
  categories: string[];
  /** Folder ID */
  folderId: string;
  /** Attempt statistics */
  stats?: {
    attemptCount: number;
    lastScore?: number;
    bestScore?: number;
  };
}

/**
 * A folder in the library view.
 */
export interface FolderView {
  id: string;
  name: string;
  examCount: number;
}

/**
 * Complete library view state.
 */
export interface LibraryViewState {
  folders: FolderView[];
  exams: ExamCardView[];
  /** Exams that are not in any folder */
  uncategorizedExams: ExamCardView[];
}

// ============================================================================
// Application-level Action Types
// ============================================================================

/**
 * Start attempt configuration.
 */
export interface StartAttemptParams {
  mode: AttemptType;
  examIds: string[];
  config?: {
    /** Simulacro-specific */
    questionCount?: number;
    timeLimitMs?: number;
    penalty?: number;
    reward?: number;
    examWeights?: Record<string, number>;
    /** Show explanations during simulacro (default: false) */
    showExplanations?: boolean;
    /** Review-specific */
    reviewQuestionCount?: number;
    wrongWeight?: number;
    blankWeight?: number;
    recoveryWeight?: number;
    weakTimeThresholdMs?: number;
    /** Adaptive review mix ratios (Phase 5) */
    reviewWeakRatio?: number;
    reviewMediumRatio?: number;
    reviewRandomRatio?: number;
  };
}
