/**
 * Domain Types - Core type definitions for the exam system
 * 
 * These types represent the fundamental data structures used throughout
 * the application. They are pure types with no dependencies.
 */

// ============================================================================
// Attempt Types - Discriminated Union (Strict per Attempt Type)
// ============================================================================

export type AttemptType = "free" | "simulacro" | "review";

export type AnswerResult = "correct" | "wrong" | "blank";

/**
 * Simulacro Attempt Config - ALL fields required for reproducibility
 * No optional fields allowed - must be fully specified at creation
 */
export interface SimulacroAttemptConfig {
  questionCount: number;
  timeLimitMs: number;
  penalty: number;
  reward: number;
  examWeights: Record<string, number>;
}

/**
 * Review Attempt Config - Minimal required fields
 */
export interface ReviewAttemptConfig {
  questionCount: number;
}

/**
 * Free Attempt Config - No config needed
 */
export interface FreeAttemptConfig {
  // Empty - free mode has no configuration
}

/**
 * Simulacro Attempt - Fully specified configuration
 */
export interface SimulacroAttempt {
  id: string;
  type: "simulacro";
  createdAt: string;
  sourceExamIds: string[];
  config: SimulacroAttemptConfig;
  parentAttemptId?: string;
}

/**
 * Review Attempt - Review mode with required question count
 */
export interface ReviewAttempt {
  id: string;
  type: "review";
  createdAt: string;
  sourceExamIds: string[];
  config: ReviewAttemptConfig;
  parentAttemptId?: string;
}

/**
 * Free Attempt - Practice mode with no config
 */
export interface FreeAttempt {
  id: string;
  type: "free";
  createdAt: string;
  sourceExamIds: string[];
  config: FreeAttemptConfig;
  parentAttemptId?: string;
}

/**
 * Attempt Discriminated Union
 * Type is determined by the 'type' discriminator field
 */
export type Attempt = SimulacroAttempt | ReviewAttempt | FreeAttempt;

/**
 * @deprecated Use specific attempt type interfaces instead
 */
export interface AttemptConfig {
  questionCount?: number;
  timeLimitMs?: number;
  penalty?: number;
  reward?: number;
  examWeights?: Record<string, number>;
}

// ============================================================================
// Exam Types - Schema v2.0 (STRICT - NO OPTIONAL FIELDS)
// ============================================================================

/**
 * Answer option for a question
 * Strict definition - all fields required
 */
export interface Answer {
  letter: string;
  text: string;
  isCorrect: boolean;
}

/**
 * Question - Core domain type (Schema v2.0)
 * Strict schema with no optional fields
 */
export interface Question {
  number: number;
  text: string;
  categoria: string[];
  articulo_referencia: string;
  feedback: {
    cita_literal: string;
    explicacion_fallo: string;
  };
  answers: Answer[];
}

/**
 * Exam - Core domain type (Schema v2.0)
 * Strict schema with no optional fields
 * schema_version literal enforces v2.0 compliance
 */
export interface Exam {
  schema_version: "2.0";
  exam_id: string;
  title: string;
  categorias: string[];
  total_questions: number;
  questions: Question[];
}

// ============================================================================
// Storage Types
// ============================================================================

/**
 * StoredExam - Internal storage wrapper for Exam
 * Contains metadata (id, title, folder) + the validated exam data
 */
export interface StoredExam {
  id: string;
  title: string;
  data: Exam;
  addedAt: string;
  folderId: string;
}

export interface Folder {
  id: string;
  name: string;
  order: number;
}

export interface QuestionProgress {
  wasCorrect: boolean;
  lastAttempt: string;
}

export interface ExamProgress {
  examId: string;
  questions: Record<number, QuestionProgress>;
  correct: number;
  total: number;
  lastPractice: string | null;
  maxCorrect: number;
  attempts: number;
  lastScore: number | null;
  bestScore: number | null;
}

export interface ExportData {
  version: number;
  exportedAt: string;
  exams: StoredExam[];
  folders: Folder[];
  progress: ExamProgress[];
  attempts?: Attempt[];
  telemetry?: QuestionTelemetry[];
}

// ============================================================================
// Practice Types
// ============================================================================

export interface PracticeOptions {
  shuffleQuestions: boolean;
  shuffleAnswers: boolean;
  showFeedback: boolean;
}

export interface UserAnswers {
  [index: number]: number;
}

// ============================================================================
// Localization Types
// ============================================================================

export type LanguageCode = "en" | "es";

export interface TranslationStrings {
  [key: string]: string;
}

// Define Translations type directly here to avoid circular dependency
export interface Translations {
  appTitle: string;
  practiceModeSubtitle: string;
  availableExams: string;
  refresh: string;
  loadExamFile: string;
  clickToSelect: string;
  dragAndDrop: string;
  orLoadManually: string;
  loading: string;
  noExamsFound: string;
  runScriptHint: string;
  options: string;
  shuffleQuestions: string;
  shuffleAnswers: string;
  showFeedback: string;
  practiceMode: string;
  reviewMode: string;
  questions: string;
  originalScore: string;
  practiceScore: string;
  bestScore: string;
  mainMenu: string;
  exam: string;
  exams: string;
  previous: string;
  next: string;
  finish: string;
  tryAgain: string;
  reviewAnswers: string;
  filterAll: string;
  filterWrong: string;
  correctAnswer: string;
  noQuestionsMatch: string;
  noWrongAnswers: string;
  originallyCorrect: string;
  originallyWrong: string;
  mastered: string;
  needsPractice: string;
  results: string;
  correctOutOf: string;
  examNotFound: string;
  errorLoading: string;
  newFolder: string;
  delete: string;
  move: string;
  moveToFolder: string;
  export: string;
  import: string;
  folderName: string;
  confirmDelete: string;
  confirmDeleteFolder: string;
  uncategorized: string;
  importFirst: string;
  back: string;
  menu: string;
  question: string;
  questionOf: string;
  unknown: string;
  loadDemoData: string;
  loadExampleExam: string;
  clearData: string;
  confirmClearData: string;
  emptyFolder: string;
  errorCreatingFolder: string;
  errorDeletingFolder: string;
  errorDeletingExam: string;
  importFailed: string;
  exportFailed: string;
  invalidExamFormat: string;
  errorRenaming: string;
  errorMovingExam: string;
  errorLoadingExample: string;
  rename: string;
  newName: string;
  attempts: string;
  attempt: string;
  backToLibrary: string;
  reviewSummary: string;
  lastScore: string;
  notAttempted: string;
  help: string;
  showHelp: string;
  hideHelp: string;
  examFormat: string;
  examFormatDesc: string;
  downloadTemplate: string;
  copyTemplate: string;
  copied: string;
  useWithAI: string;
  aiHelpText: string;
  templateDownloaded: string;
  copyInstead: string;
  onboardingSkip: string;
  onboardingBack: string;
  onboardingNext: string;
  onboardingFinish: string;
  onboardingWelcomeTitle: string;
  onboardingWelcomeText: string;
  onboardingStorageTitle: string;
  onboardingStorageText: string;
  onboardingCreateTitle: string;
  onboardingCreateText: string;
  onboardingEasyTitle: string;
  onboardingEasyDesc: string;
  onboardingAdvancedTitle: string;
  onboardingAdvancedDesc: string;
  onboardingImportTitle: string;
  onboardingImportText: string;
  onboardingPracticeTitle: string;
  onboardingPracticeText: string;
  onboardingOrganizeTitle: string;
  onboardingOrganizeText: string;
  showOnboarding: string;
  orGeneratePrompt: string;
  generateAIPrompt: string;
  aiPromptTitle: string;
  aiPromptSubtitle: string;
  numQuestionsLabel: string;
  numAnswersLabel: string;
  difficultyLabel: string;
  difficultyEasy: string;
  difficultyMedium: string;
  difficultyHard: string;
  difficultyMixed: string;
  materialLabel: string;
  materialPlaceholder: string;
  generatePromptBtn: string;
  yourPrompt: string;
  copyAndPaste: string;
  copyGeneratedPrompt: string;
  aiPromptNoMaterial: string;
  materialInChatLabel: string;
  kimiSuggestion: string;
  howToCreate: string;
  easyWay: string;
  easyWayDesc: string;
  advancedWay: string;
  advancedWayDesc: string;
  leavingSite: string;
  externalLinkConfirm: string;
  stayHere: string;
  continue: string;
  nowPaste: string;

  // Tarjeta Roja (Wrong Answer Feedback)
  referenceArticle: string;
  literalCitation: string;
  explanation: string;

  [key: string]: string;
}

// ============================================================================
// Telemetry Types (for future use - scaffolding only)
// ============================================================================

export interface QuestionTelemetry {
  id: string;
  examId: string;
  questionNumber: number;
  timesCorrect: number;
  timesWrong: number;
  timesBlank: number;
  consecutiveCorrect: number;
  avgResponseTimeMs: number;
  totalSeen: number;
  lastSeenAt: string;
}
