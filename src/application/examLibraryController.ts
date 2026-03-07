/**
 * ExamLibraryController — Application Orchestration Layer
 *
 * This module is the single boundary between the UI and the storage/domain
 * layers for all exam library operations. The UI must never call storage
 * methods directly.
 *
 * Responsibilities:
 * - Load and expose the exam library as view state
 * - Import/validate exam files
 * - Manage folders
 * - Export/import data
 * - Delete exams (with cascade via storage)
 *
 * Forbidden:
 * - No DOM access
 * - No CSS
 * - No rendering
 * - No localization
 */

import type {
  StoredExam,
  Exam,
  Folder,
  ExportData,
  Attempt,
  CategoryWeakness,
  CategoryStats,
  CategoryMastery,
} from "../domain/types.js";

import { validateExam } from "../domain/validation.js";
import { getAttemptStatsForExam } from "../domain/attemptSelectors.js";
import { computeCategoryWeakness } from "../domain/categoryWeakness.js";
import { computeCategoryStats } from "../domain/categoryStats.js";
import {
  computeCategoryMastery,
  DEFAULT_MASTERY_THRESHOLDS,
  type MasteryThresholds,
} from "../domain/categoryMastery.js";
import { DEFAULTS } from "../domain/defaults.js";
import type { WeaknessWeights } from "../domain/weakness.js";
import { computeWeakScore } from "../domain/weakness.js";
import {
  computeQuestionDifficulty,
  type QuestionDifficulty,
} from "../domain/questionDifficulty.js";
import {
  computeTrapSignals,
  type TrapSignal,
  type TrapThresholds,
} from "../domain/trapDetection.js";
import {
  computeExamReadiness,
  computeAvgCategoryMastery,
  computeRecentSimulacroAccuracy,
  computeWeaknessRecoveryRate,
  type ExamReadiness,
  type ReadinessConfig,
} from "../domain/examReadiness.js";

import type { ExamStorage } from "../storage/db.js";
import { DB_VERSION } from "../storage/db.js";

import type {
  ExamCardView,
  FolderView,
  LibraryViewState,
  BackupSnapshot,
  HomeViewData,
  InsightsViewData,
  InsightsQuestionData,
  TelemetryViewData,
  TelemetryQuestionData,
} from "./viewState.js";
import { SNAPSHOT_VERSION } from "./viewState.js";
import { validateBackupSnapshot } from "./backupValidation.js";

// ============================================================================
// Custom Errors
// ============================================================================

/**
 * Thrown when attempting to import an exam with an exam_id that already exists.
 */
export class DuplicateExamError extends Error {
  public readonly examId: string;
  public readonly existingTitle: string;

  constructor(examId: string, existingTitle: string) {
    super(`Duplicate exam_id: "${examId}" (existing: "${existingTitle}")`);
    this.name = "DuplicateExamError";
    this.examId = examId;
    this.existingTitle = existingTitle;
  }
}

// ============================================================================
// ExamLibraryController
// ============================================================================

export class ExamLibraryController {
  private storage: ExamStorage;

  constructor(storage: ExamStorage) {
    this.storage = storage;
  }

  // ==========================================================================
  // Library View State
  // ==========================================================================

  /**
   * Produce the complete library view state for the UI.
   *
   * Flow:
   * 1. Load all exams, folders, and attempts from storage
   * 2. Compute attempt stats per exam (via domain selectors)
   * 3. Build view models
   *
   * @returns Serializable LibraryViewState
   */
  async getLibraryViewState(): Promise<LibraryViewState> {
    const [storedExams, folders, attempts] = await Promise.all([
      this.storage.getExams(),
      this.storage.getFolders(),
      this.storage.getAllAttempts(),
    ]);

    const examCards = storedExams.map((exam) =>
      this.buildExamCard(exam, attempts),
    );

    const folderViews = folders.map(
      (folder): FolderView => ({
        id: folder.id,
        name: folder.name,
        examCount: examCards.filter((e) => e.folderId === folder.id).length,
      }),
    );

    const uncategorizedExams = examCards.filter(
      (e) => e.folderId === "uncategorized",
    );

    return {
      folders: folderViews,
      exams: examCards,
      uncategorizedExams,
    };
  }

  // ==========================================================================
  // Exam Operations
  // ==========================================================================

  /**
   * Validate an exam JSON without importing it.
   * Returns the validated Exam object if valid, throws on failure.
   *
   * @param json - Unknown JSON data to validate
   * @returns The validated Exam object
   * @throws Error if validation fails
   */
  validateExamJson(json: unknown): Exam {
    return validateExam(json);
  }

  /**
   * Get all stored exams (for duplicate checking, etc.).
   */
  async getExams(): Promise<StoredExam[]> {
    return this.storage.getExams();
  }

  /**
   * Import and validate an exam from a JSON object.
   *
   * @param json - Unknown JSON data to validate and import
   * @param folderId - Target folder (defaults to "uncategorized")
   * @returns The storage ID of the imported exam
   * @throws Error if validation fails
   */
  async importExam(
    json: unknown,
    folderId: string = "uncategorized",
    overwriteIfDuplicate: boolean = false,
  ): Promise<string> {
    // Validate through the domain layer
    const validatedExam: Exam = validateExam(json);

    // Check for duplicate exam_id
    const existingExams = await this.storage.getExams();
    const duplicate = existingExams.find(
      (e) => e.data.exam_id === validatedExam.exam_id,
    );

    if (duplicate && !overwriteIfDuplicate) {
      throw new DuplicateExamError(validatedExam.exam_id, duplicate.title);
    }

    const storedExam: StoredExam = {
      id: duplicate?.id ?? crypto.randomUUID(),
      title: validatedExam.title,
      data: validatedExam,
      addedAt: new Date().toISOString(),
      folderId: duplicate ? duplicate.folderId : folderId,
    };

    return this.storage.saveExam(storedExam);
  }

  /**
   * Delete an exam by ID (cascades to telemetry + attempts via storage).
   */
  async deleteExam(examId: string): Promise<void> {
    await this.storage.deleteExam(examId);
  }

  /**
   * Move an exam to a different folder.
   */
  async moveExam(examId: string, targetFolderId: string): Promise<void> {
    const exam = await this.storage.getExam(examId);
    if (!exam) {
      throw new Error(`Exam not found: ${examId}`);
    }

    exam.folderId = targetFolderId;
    await this.storage.saveExam(exam);
  }

  /**
   * Rename an exam.
   */
  async renameExam(examId: string, newTitle: string): Promise<void> {
    if (!newTitle || newTitle.trim().length === 0) {
      throw new Error("Exam title must be non-empty");
    }

    const exam = await this.storage.getExam(examId);
    if (!exam) {
      throw new Error(`Exam not found: ${examId}`);
    }

    exam.title = newTitle.trim();
    await this.storage.saveExam(exam);
  }

  // ==========================================================================
  // Folder Operations
  // ==========================================================================

  /**
   * Create a new folder.
   *
   * @param name - Folder name
   * @returns Folder ID
   */
  async createFolder(name: string): Promise<string> {
    if (!name || name.trim().length === 0) {
      throw new Error("Folder name must be non-empty");
    }

    const folder: Folder = {
      id: crypto.randomUUID(),
      name: name.trim(),
      order: 0,
    };

    return this.storage.saveFolder(folder);
  }

  /**
   * Rename an existing folder.
   */
  async renameFolder(folderId: string, newName: string): Promise<void> {
    if (!newName || newName.trim().length === 0) {
      throw new Error("Folder name must be non-empty");
    }

    const folders = await this.storage.getFolders();
    const folder = folders.find((f) => f.id === folderId);
    if (!folder) {
      throw new Error(`Folder not found: ${folderId}`);
    }

    folder.name = newName.trim();
    await this.storage.saveFolder(folder);
  }

  /**
   * Delete a folder (exams are moved to uncategorized via storage).
   */
  async deleteFolder(folderId: string): Promise<void> {
    await this.storage.deleteFolder(folderId);
  }

  // ==========================================================================
  // Data Import/Export
  // ==========================================================================

  /**
   * Export all data as a serializable object (legacy format).
   */
  async exportData(): Promise<ExportData> {
    return this.storage.exportData();
  }

  /**
   * Import data from an export file (legacy merge format).
   */
  async importData(data: ExportData): Promise<void> {
    await this.storage.importData(data);
  }

  // ==========================================================================
  // Backup / Restore (Snapshot-based)
  // ==========================================================================

  /**
   * Create a full backup snapshot of all application data.
   *
   * The snapshot includes metadata (version, timestamp) and all data stores.
   *
   * @returns A BackupSnapshot ready for serialization
   */
  async createBackup(): Promise<BackupSnapshot> {
    const [exams, folders, attempts, telemetry] = await Promise.all([
      this.storage.getExams(),
      this.storage.getFolders(),
      this.storage.getAllAttempts(),
      this.storage.getAllQuestionTelemetry(),
    ]);

    return {
      snapshot_version: SNAPSHOT_VERSION,
      db_version: DB_VERSION,
      created_at: new Date().toISOString(),
      data: {
        exams,
        folders,
        attempts,
        questionTelemetry: telemetry,
      },
    };
  }

  /**
   * Restore application data from a backup snapshot.
   *
   * This is a DESTRUCTIVE operation:
   * 1. Validates the snapshot format
   * 2. Clears ALL existing data
   * 3. Restores data in dependency order: folders → exams → attempts → telemetry
   *
   * @param snapshot - Unknown data to validate and restore
   * @throws Error if validation fails
   */
  async restoreBackup(snapshot: unknown): Promise<void> {
    // 1. Validate snapshot format
    const validation = validateBackupSnapshot(snapshot);
    if (!validation.valid) {
      throw new Error(
        `Invalid backup format:\n${validation.errors.join("\n")}`,
      );
    }

    const validSnapshot = snapshot as BackupSnapshot;

    // 2. Clear all existing data
    await this.storage.clearAll();

    // 3. Restore via storage.importData (maps snapshot to ExportData)
    await this.storage.importData({
      version: validSnapshot.db_version,
      exportedAt: validSnapshot.created_at,
      exams: validSnapshot.data.exams,
      folders: validSnapshot.data.folders,
      attempts: validSnapshot.data.attempts,
      telemetry: validSnapshot.data.questionTelemetry,
    });
  }

  /**
   * Clear all application data.
   */
  async clearAllData(): Promise<void> {
    await this.storage.clearAll();
  }

  // ==========================================================================
  // Telemetry Reset
  // ==========================================================================

  /**
   * Reset telemetry for a specific exam.
   */
  async resetTelemetry(examId: string): Promise<void> {
    await this.storage.deleteTelemetryForExam(examId);
  }

  /**
   * Reset all telemetry globally.
   */
  async resetAllTelemetry(): Promise<void> {
    await this.storage.clearAllQuestionTelemetry();
  }

  // ==========================================================================
  // Category Analytics (Phase 5)
  // ==========================================================================

  /**
   * Compute per-category performance statistics for an exam.
   *
   * @param examId - The storage ID of the exam
   * @returns Array of CategoryStats sorted by category name
   * @throws Error if exam not found
   */
  async getCategoryStats(examId: string): Promise<CategoryStats[]> {
    const storedExam = await this.storage.getExam(examId);
    if (!storedExam) {
      throw new Error(`Exam not found: ${examId}`);
    }

    const telemetry = await this.storage.getTelemetryByExam(examId);
    return computeCategoryStats(storedExam.data.questions, telemetry);
  }

  /**
   * Compute per-category weakness scores for an exam.
   *
   * @param examId - The storage ID of the exam
   * @param weights - Optional weight overrides (defaults applied from DEFAULTS)
   * @returns Array of CategoryWeakness sorted by score DESC
   * @throws Error if exam not found
   */
  async getCategoryWeakness(
    examId: string,
    weights?: Partial<WeaknessWeights>,
  ): Promise<CategoryWeakness[]> {
    const storedExam = await this.storage.getExam(examId);
    if (!storedExam) {
      throw new Error(`Exam not found: ${examId}`);
    }

    const telemetry = await this.storage.getTelemetryByExam(examId);

    const effectiveWeights: WeaknessWeights = {
      wrongWeight: weights?.wrongWeight ?? DEFAULTS.wrongWeight,
      blankWeight: weights?.blankWeight ?? DEFAULTS.blankWeight,
      recoveryWeight: weights?.recoveryWeight ?? DEFAULTS.recoveryWeight,
      weakTimeThresholdMs:
        weights?.weakTimeThresholdMs ?? DEFAULTS.weakTimeThresholdMs,
    };

    return computeCategoryWeakness(
      storedExam.data.questions,
      telemetry,
      effectiveWeights,
    );
  }

  /**
   * Compute per-category mastery classification for an exam (Phase 6).
   *
   * @param examId - The storage ID of the exam
   * @param weights - Optional weakness weight overrides
   * @param thresholds - Optional mastery threshold overrides
   * @returns Array of CategoryMastery sorted by category ASC
   * @throws Error if exam not found
   */
  async getCategoryMastery(
    examId: string,
    weights?: Partial<WeaknessWeights>,
    thresholds?: Partial<MasteryThresholds>,
  ): Promise<CategoryMastery[]> {
    const storedExam = await this.storage.getExam(examId);
    if (!storedExam) {
      throw new Error(`Exam not found: ${examId}`);
    }

    const telemetry = await this.storage.getTelemetryByExam(examId);

    const effectiveWeights: WeaknessWeights = {
      wrongWeight: weights?.wrongWeight ?? DEFAULTS.wrongWeight,
      blankWeight: weights?.blankWeight ?? DEFAULTS.blankWeight,
      recoveryWeight: weights?.recoveryWeight ?? DEFAULTS.recoveryWeight,
      weakTimeThresholdMs:
        weights?.weakTimeThresholdMs ?? DEFAULTS.weakTimeThresholdMs,
    };

    const effectiveThresholds: MasteryThresholds = {
      weakThreshold:
        thresholds?.weakThreshold ?? DEFAULT_MASTERY_THRESHOLDS.weakThreshold,
      masteredThreshold:
        thresholds?.masteredThreshold ??
        DEFAULT_MASTERY_THRESHOLDS.masteredThreshold,
      accuracyLow:
        thresholds?.accuracyLow ?? DEFAULT_MASTERY_THRESHOLDS.accuracyLow,
      accuracyHigh:
        thresholds?.accuracyHigh ?? DEFAULT_MASTERY_THRESHOLDS.accuracyHigh,
    };

    return computeCategoryMastery(
      storedExam.data.questions,
      telemetry,
      effectiveWeights,
      effectiveThresholds,
    );
  }

  // ==========================================================================
  // Question Difficulty Analytics (Phase 8)
  // ==========================================================================

  /**
   * Compute per-question difficulty estimations for an exam.
   *
   * Difficulty is derived from telemetry: (timesWrong + timesBlank) / totalSeen.
   * Questions without telemetry default to difficulty 0 (easy).
   *
   * @param examId - The storage ID of the exam
   * @returns Array of QuestionDifficulty sorted by questionNumber ASC
   * @throws Error if exam not found
   */
  async getQuestionDifficulty(examId: string): Promise<QuestionDifficulty[]> {
    const storedExam = await this.storage.getExam(examId);
    if (!storedExam) {
      throw new Error(`Exam not found: ${examId}`);
    }

    const telemetry = await this.storage.getTelemetryByExam(examId);
    return computeQuestionDifficulty(storedExam.data.questions, telemetry);
  }

  // ==========================================================================
  // Trap Question Detection (Phase 9)
  // ==========================================================================

  /**
   * Compute trap signals for all questions in an exam.
   *
   * A trap question is one where category mastery is high but the user
   * repeatedly fails the question, indicating misleading wording or trick answers.
   *
   * @param examId - The storage ID of the exam
   * @returns Array of TrapSignal sorted by questionNumber ASC
   * @throws Error if exam not found
   */
  async getTrapSignals(examId: string): Promise<TrapSignal[]> {
    const storedExam = await this.storage.getExam(examId);
    if (!storedExam) {
      throw new Error(`Exam not found: ${examId}`);
    }

    const telemetry = await this.storage.getTelemetryByExam(examId);

    const effectiveWeights: WeaknessWeights = {
      wrongWeight: DEFAULTS.wrongWeight,
      blankWeight: DEFAULTS.blankWeight,
      recoveryWeight: DEFAULTS.recoveryWeight,
      weakTimeThresholdMs: DEFAULTS.weakTimeThresholdMs,
    };

    const categoryMastery = computeCategoryMastery(
      storedExam.data.questions,
      telemetry,
      effectiveWeights,
      DEFAULT_MASTERY_THRESHOLDS,
    );

    const thresholds: TrapThresholds = {
      possibleThreshold: DEFAULTS.trapPossibleThreshold,
      confirmedThreshold: DEFAULTS.trapConfirmedThreshold,
    };

    return computeTrapSignals(
      storedExam.data.questions,
      telemetry,
      categoryMastery,
      thresholds,
    );
  }

  // ==========================================================================
  // Exam Readiness Estimation (Phase 9)
  // ==========================================================================

  /**
   * Compute the overall exam readiness score and classification.
   *
   * Uses category mastery, recent simulacro accuracy, and weakness
   * recovery rate to estimate whether the user is ready for the real exam.
   *
   * @returns ExamReadiness with score (0–100) and classification
   */
  async getExamReadiness(): Promise<ExamReadiness> {
    const [storedExams, attempts, telemetry] = await Promise.all([
      this.storage.getExams(),
      this.storage.getAllAttempts(),
      this.storage.getAllQuestionTelemetry(),
    ]);

    // Collect all questions from all exams
    const allQuestions = storedExams.flatMap((e) => e.data.questions);

    const effectiveWeights: WeaknessWeights = {
      wrongWeight: DEFAULTS.wrongWeight,
      blankWeight: DEFAULTS.blankWeight,
      recoveryWeight: DEFAULTS.recoveryWeight,
      weakTimeThresholdMs: DEFAULTS.weakTimeThresholdMs,
    };

    const categoryMastery = computeCategoryMastery(
      allQuestions,
      telemetry,
      effectiveWeights,
      DEFAULT_MASTERY_THRESHOLDS,
    );

    const config: ReadinessConfig = {
      simulacroWindow: DEFAULTS.readinessSimulacroWindow,
    };

    return computeExamReadiness(categoryMastery, attempts, telemetry, config);
  }

  // ==========================================================================
  // Home Dashboard Data (Phase 11)
  // ==========================================================================

  /**
   * Produce all data needed by the Home Dashboard in a single call.
   *
   * Loads exams, attempts, and telemetry once, then computes:
   * - Readiness score, level, and breakdown components
   * - Category mastery across all exams
   * - Raw attempts (for quick stats)
   *
   * @returns HomeViewData for the dashboard
   */
  async getHomeViewData(): Promise<HomeViewData> {
    const [storedExams, attempts, telemetry] = await Promise.all([
      this.storage.getExams(),
      this.storage.getAllAttempts(),
      this.storage.getAllQuestionTelemetry(),
    ]);

    const allQuestions = storedExams.flatMap((e) => e.data.questions);

    const effectiveWeights: WeaknessWeights = {
      wrongWeight: DEFAULTS.wrongWeight,
      blankWeight: DEFAULTS.blankWeight,
      recoveryWeight: DEFAULTS.recoveryWeight,
      weakTimeThresholdMs: DEFAULTS.weakTimeThresholdMs,
    };

    const categoryMastery = computeCategoryMastery(
      allQuestions,
      telemetry,
      effectiveWeights,
      DEFAULT_MASTERY_THRESHOLDS,
    );

    const config: ReadinessConfig = {
      simulacroWindow: DEFAULTS.readinessSimulacroWindow,
    };

    const readiness = computeExamReadiness(
      categoryMastery,
      attempts,
      telemetry,
      config,
    );

    // Compute breakdown components individually
    const avgMastery = computeAvgCategoryMastery(categoryMastery);
    const simulacroAccuracy = computeRecentSimulacroAccuracy(
      attempts,
      config.simulacroWindow,
    );
    const recoveryRate = computeWeaknessRecoveryRate(telemetry);

    return {
      readiness: {
        score: readiness.readinessScore,
        level: readiness.readinessLevel,
        breakdown: {
          categoryMastery: avgMastery,
          simulacroAccuracy,
          recoveryRate,
        },
      },
      categoryMastery,
      attempts,
    };
  }

  // ==========================================================================
  // Insights Data (Phase 12)
  // ==========================================================================

  /**
   * Produce all data needed by the Insights view in a single call.
   *
   * Loads exams, attempts, and telemetry once, then computes:
   * - Category mastery across all exams (sorted weakest first)
   * - Per-question enriched data (weakness, difficulty, trap signals)
   * - Difficulty distribution aggregate
   * - Raw attempt history
   *
   * Read-only — no mutations or telemetry updates.
   *
   * @returns InsightsViewData for the Insights view
   */
  async getInsightsData(): Promise<InsightsViewData> {
    const [storedExams, attempts, allTelemetry] = await Promise.all([
      this.storage.getExams(),
      this.storage.getAllAttempts(),
      this.storage.getAllQuestionTelemetry(),
    ]);

    const allQuestions = storedExams.flatMap((e) => e.data.questions);

    const effectiveWeights: WeaknessWeights = {
      wrongWeight: DEFAULTS.wrongWeight,
      blankWeight: DEFAULTS.blankWeight,
      recoveryWeight: DEFAULTS.recoveryWeight,
      weakTimeThresholdMs: DEFAULTS.weakTimeThresholdMs,
    };

    const categoryMastery = computeCategoryMastery(
      allQuestions,
      allTelemetry,
      effectiveWeights,
      DEFAULT_MASTERY_THRESHOLDS,
    );

    const trapThresholds: TrapThresholds = {
      possibleThreshold: DEFAULTS.trapPossibleThreshold,
      confirmedThreshold: DEFAULTS.trapConfirmedThreshold,
    };

    // Build per-question enriched data across all exams
    const questions: InsightsQuestionData[] = [];
    const distribution = { easy: 0, medium: 0, hard: 0, total: 0 };

    for (const exam of storedExams) {
      const examTelemetry = allTelemetry.filter((t) => t.examId === exam.id);

      const difficultyResults = computeQuestionDifficulty(
        exam.data.questions,
        examTelemetry,
      );

      const trapResults = computeTrapSignals(
        exam.data.questions,
        examTelemetry,
        categoryMastery,
        trapThresholds,
      );

      for (const q of exam.data.questions) {
        const tel = examTelemetry.find((t) => t.questionNumber === q.number);
        const weakScore = tel ? computeWeakScore(tel, effectiveWeights) : 0;
        const diff = difficultyResults.find(
          (d) => d.questionNumber === q.number,
        );
        const trap = trapResults.find((t) => t.questionNumber === q.number);

        const diffLevel = diff?.difficultyLevel ?? "easy";
        distribution[diffLevel]++;
        distribution.total++;

        questions.push({
          examId: exam.id,
          examTitle: exam.title,
          questionNumber: q.number,
          questionText: q.text,
          categories: q.categoria,
          referenceArticle: q.articulo_referencia,
          weaknessScore: weakScore,
          difficultyLevel: diffLevel,
          difficultyScore: diff?.difficultyScore ?? 0,
          trapLevel: trap?.trapLevel ?? "none",
          trapScore: trap?.trapScore ?? 0,
          answers: q.answers.map((a) => ({
            letter: a.letter,
            text: a.text,
            isCorrect: a.isCorrect,
          })),
          feedback: {
            literalCitation: q.feedback.cita_literal,
            explanation: q.feedback.explicacion_fallo,
          },
        });
      }
    }

    // Sort mastery: weakest first (highest weakness score first)
    const sortedMastery = [...categoryMastery].sort(
      (a, b) => b.weaknessScore - a.weaknessScore,
    );

    return {
      categoryMastery: sortedMastery,
      questions,
      attempts,
      difficultyDistribution: distribution,
    };
  }

  // ==========================================================================
  // Telemetry Dashboard Data (Phase 15)
  // ==========================================================================

  /**
   * Produce all data needed by the Telemetry Dashboard in a single call.
   *
   * Loads exams and telemetry once, then joins question metadata with
   * per-question telemetry records. No analytics computation is performed
   * here — that belongs in UI-layer helpers.
   *
   * @returns TelemetryViewData for the Telemetry Dashboard
   */
  async getTelemetryData(): Promise<TelemetryViewData> {
    const [storedExams, allTelemetry] = await Promise.all([
      this.storage.getExams(),
      this.storage.getAllQuestionTelemetry(),
    ]);

    // Build a lookup map: "examId::questionNumber" → QuestionTelemetry
    const telemetryMap = new Map<
      string,
      import("../domain/types.js").QuestionTelemetry
    >();
    for (const t of allTelemetry) {
      telemetryMap.set(`${t.examId}::${t.questionNumber}`, t);
    }

    const allCategories = new Set<string>();
    const questions: TelemetryQuestionData[] = [];

    for (const exam of storedExams) {
      for (const q of exam.data.questions) {
        for (const cat of q.categoria) {
          allCategories.add(cat);
        }

        const tel = telemetryMap.get(`${exam.id}::${q.number}`);

        questions.push({
          examId: exam.id,
          examTitle: exam.title,
          questionNumber: q.number,
          questionText: q.text,
          categories: q.categoria,
          timesCorrect: tel?.timesCorrect ?? 0,
          timesWrong: tel?.timesWrong ?? 0,
          timesBlank: tel?.timesBlank ?? 0,
          consecutiveCorrect: tel?.consecutiveCorrect ?? 0,
          avgResponseTimeMs: tel?.avgResponseTimeMs ?? 0,
          totalSeen: tel?.totalSeen ?? 0,
          lastSeenAt: tel?.lastSeenAt ?? "",
        });
      }
    }

    return {
      questions,
      allCategories: [...allCategories].sort(),
    };
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /**
   * Build an ExamCardView from a StoredExam + attempt stats.
   */
  private buildExamCard(exam: StoredExam, attempts: Attempt[]): ExamCardView {
    const stats = getAttemptStatsForExam(attempts, exam.id);

    return {
      id: exam.id,
      title: exam.title,
      questionCount: exam.data.total_questions,
      categories: exam.data.categorias,
      folderId: exam.folderId,
      stats: stats
        ? {
            attemptCount: stats.attemptCount,
            lastScore: stats.lastScore,
            bestScore: stats.bestScore,
          }
        : undefined,
    };
  }
}
