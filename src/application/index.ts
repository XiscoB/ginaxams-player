/**
 * Application Layer — Public API
 *
 * This barrel module re-exports the application layer's public surface.
 * The UI should import from here (or from individual controller files).
 *
 * Architecture:
 *   UI → Application Layer → Domain Engine + Storage
 *
 * The application layer is the ONLY bridge between UI and engine.
 */

// Controllers
export { AttemptController } from "./attemptController.js";
export { ExamLibraryController } from "./examLibraryController.js";

// Backup validation
export {
  validateBackupSnapshot,
  isValidBackupSnapshot,
} from "./backupValidation.js";
export type { BackupValidationResult } from "./backupValidation.js";

// View state types (UI contract)
export type {
  AttemptViewState,
  AttemptResultViewState,
  AnswerView,
  AnswerViewWithResult,
  FeedbackView,
  QuestionResultView,
  ExamCardView,
  FolderView,
  LibraryViewState,
  StartAttemptParams,
  BackupSnapshot,
  HomeViewData,
  ReadinessBreakdown,
  InsightsViewData,
  InsightsQuestionData,
  InsightsDifficultyDistribution,
} from "./viewState.js";
export { SNAPSHOT_VERSION } from "./viewState.js";
