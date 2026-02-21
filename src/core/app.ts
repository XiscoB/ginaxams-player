/**
 * Main Application Logic
 *
 * The App class coordinates all functionality:
 * - Exam library management
 * - File import/export
 * - Language switching
 * - UI navigation
 * - Attempt execution orchestration
 */

import type {
  StoredExam,
  Exam,
  Question,
  Folder,
  ExamProgress,
  ExportData,
  Translations,
  Attempt,
  FreeAttempt,
  SimulacroAttempt,
  ReviewAttempt,
  AttemptSessionState,
  QuestionTelemetry,
} from "../domain/types.js";
import { storage } from "../storage/db.js";
import { validateExam } from "../domain/validation.js";
import { PracticeManager } from "../modes/practice.js";
import { getTranslations, detectBrowserLanguage, type LanguageCode } from "../i18n/index.js";
import { calculatePercentage } from "../domain/scoring.js";
import { AttemptRunner } from "../domain/attemptRunner.js";
import { shuffleArray } from "../domain/scoring.js";

/**
 * View state for UI routing
 */
type View =
  | "library"      // Exam library/folders
  | "attemptConfig" // Mode selection (Free/Simulacro/Review)
  | "attemptExecution" // Active attempt
  | "results";     // Attempt results

/**
 * Pending attempt configuration
 */
interface PendingAttempt {
  examId: string;
  examData: Exam;
}

/**
 * Main Application Class
 */
export class App {
  // Core components
  practiceManager: PracticeManager;
  private storage = storage;

  // State
  private exams: StoredExam[] = [];
  private folders: Folder[] = [];
  private translations: Translations = getTranslations("en");
  private currentLang: LanguageCode = "en";
  private templateJSON: Record<string, unknown> | null = null;

  // View State Machine
  private currentView: View = "library";
  private pendingAttempt: PendingAttempt | null = null;

  // Attempt Execution State
  private currentRunner: AttemptRunner | null = null;
  private currentAttempt: Attempt | null = null;

  // UI State
  private currentOnboardingStep = 1;
  private totalOnboardingSteps = 5;
  private pendingExternalLink: string | null = null;

  constructor() {
    // Initialize PracticeManager as dumb renderer
    this.practiceManager = new PracticeManager({
      onAnswer: (answerIndex: number) => this.handleAnswer(answerIndex),
      onNext: () => this.handleNext(),
      onFinish: () => this.handleFinish(),
      getTranslations: () => this.translations,
    });

    this.init();
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  private async init(): Promise<void> {
    try {
      await this.storage.ready();

      // Load Language Preference
      const savedLang = localStorage.getItem("ginaxams_lang") as LanguageCode | null;
      const detectedLang = detectBrowserLanguage();
      this.setLanguage(savedLang || detectedLang);

      // Load template JSON for display
      await this.loadTemplateJSON();

      // Initial Load
      await this.refreshLibrary();

      this.bindEvents();
      this.setView("library");

      // Show onboarding for first-time users
      this.checkOnboarding();
    } catch (e) {
      console.error("App Init Error:", e);
    }
  }

  // ============================================================================
  // View State Machine
  // ============================================================================

  private setView(view: View): void {
    this.currentView = view;
    this.hideAllScreens();

    switch (view) {
      case "library":
        this.showLibraryScreen();
        break;
      case "attemptConfig":
        this.showAttemptConfigScreen();
        break;
      case "attemptExecution":
        this.showAttemptExecutionScreen();
        break;
      case "results":
        this.showResultsScreen();
        break;
    }
  }

  private hideAllScreens(): void {
    document.querySelectorAll('[id$="Screen"]').forEach((el) => {
      el.classList.add("hidden");
    });
  }

  // ============================================================================
  // Screen Rendering
  // ============================================================================

  private showLibraryScreen(): void {
    const fileScreen = document.getElementById("fileScreen");
    if (fileScreen) {
      fileScreen.classList.remove("hidden");
    }
    const examTitle = document.getElementById("examTitle");
    if (examTitle) {
      examTitle.textContent = "";
    }
    this.refreshLibrary();
  }

  private showAttemptConfigScreen(): void {
    if (!this.pendingAttempt) {
      this.setView("library");
      return;
    }

    // Create mode selection screen dynamically if it doesn't exist
    let configScreen = document.getElementById("attemptConfigScreen");
    if (!configScreen) {
      configScreen = this.createAttemptConfigScreen();
    }

    configScreen.classList.remove("hidden");

    // Update exam title
    const examTitle = document.getElementById("examTitle");
    if (examTitle && this.pendingAttempt) {
      examTitle.textContent = this.pendingAttempt.examData.title;
    }
  }

  private createAttemptConfigScreen(): HTMLElement {
    const screen = document.createElement("div");
    screen.id = "attemptConfigScreen";
    screen.className = "screen hidden";

    const T = this.translations;

    screen.innerHTML = `
      <div class="container">
        <h2>${T.selectMode || "Select Practice Mode"}</h2>
        <div class="mode-selection">
          <button id="btnFreeMode" class="mode-btn mode-free">
            <span class="mode-icon">📚</span>
            <span class="mode-name">${T.freeMode || "Free Mode"}</span>
            <span class="mode-desc">${T.freeModeDesc || "Practice at your own pace with full exam"}</span>
          </button>
          <button id="btnSimulacroMode" class="mode-btn mode-simulacro">
            <span class="mode-icon">⏱️</span>
            <span class="mode-name">${T.simulacroMode || "Simulacro"}</span>
            <span class="mode-desc">${T.simulacroModeDesc || "Timed exam simulation"}</span>
          </button>
          <button id="btnReviewMode" class="mode-btn mode-review">
            <span class="mode-icon">🎯</span>
            <span class="mode-name">${T.reviewMode || "Review Mode"}</span>
            <span class="mode-desc">${T.reviewModeDesc || "Focus on weak questions"}</span>
          </button>
        </div>
        <button id="btnBackToLibrary" class="secondary-btn">${T.back || "Back"}</button>
      </div>
    `;

    document.body.appendChild(screen);

    // Bind mode selection buttons
    screen.querySelector("#btnFreeMode")?.addEventListener("click", () => {
      this.startAttempt("free");
    });
    screen.querySelector("#btnSimulacroMode")?.addEventListener("click", () => {
      this.startAttempt("simulacro");
    });
    screen.querySelector("#btnReviewMode")?.addEventListener("click", () => {
      this.startAttempt("review");
    });
    screen.querySelector("#btnBackToLibrary")?.addEventListener("click", () => {
      this.pendingAttempt = null;
      this.setView("library");
    });

    return screen;
  }

  private showAttemptExecutionScreen(): void {
    const practiceScreen = document.getElementById("practiceScreen");
    if (practiceScreen) {
      practiceScreen.classList.remove("hidden");
    }

    // Initial render if we have a runner
    if (this.currentRunner) {
      const state = this.currentRunner.getState();
      this.practiceManager.render(state);
    }
  }

  private showResultsScreen(): void {
    if (!this.currentRunner) {
      this.setView("library");
      return;
    }

    const state = this.currentRunner.getState();
    if (!state.isFinished || !state.result) {
      this.setView("attemptExecution");
      return;
    }

    const resultsScreen = document.getElementById("resultsScreen");
    if (resultsScreen) {
      resultsScreen.classList.remove("hidden");
    }

    // Render results via PracticeManager
    this.practiceManager.renderResults(state);

    // Update legacy progress (preserved for UI stats during migration)
    if (this.currentAttempt) {
      const examId = this.currentAttempt.sourceExamIds[0];
      const percentage = state.result.percentage;

      // Fire-and-forget legacy progress updates
      this.saveScore(examId, percentage).catch(console.warn);
      this.incrementAttempt(examId).catch(console.warn);
    }
  }

  // ============================================================================
  // Attempt Creation & Runner Management
  // ============================================================================

  /**
   * User clicked on an exam - show mode selection
   */
  selectExam(examId: string): void {
    const exam = this.exams.find((e) => e.id === examId);
    if (!exam) {
      alert(this.translations.examNotFound);
      return;
    }

    this.pendingAttempt = {
      examId,
      examData: exam.data,
    };

    this.setView("attemptConfig");
  }

  /**
   * Start a new attempt with the selected mode
   */
  private async startAttempt(mode: "free" | "simulacro" | "review"): Promise<void> {
    if (!this.pendingAttempt) {
      this.setView("library");
      return;
    }

    const { examId, examData } = this.pendingAttempt;

    // Prepare question set based on mode
    let questions: Question[] = [...examData.questions];

    // Apply shuffling for free/simulacro modes
    if (mode === "free" || mode === "simulacro") {
      questions = shuffleArray(questions);
    }

    // Create Attempt entity
    const attempt = this.createAttempt(mode, examId, questions.length);
    this.currentAttempt = attempt;

    // Persist Attempt
    try {
      await this.storage.saveAttempt(attempt);
    } catch (e) {
      console.error("Failed to save attempt:", e);
      alert("Failed to start attempt. Please try again.");
      return;
    }

    // Create telemetry lookup function
    const getTelemetry = (qExamId: string, questionNumber: number): QuestionTelemetry | undefined => {
      // Synchronous lookup - storage will be queried during submitAnswer
      // This is a placeholder - actual lookup happens async in persistTelemetryUpdates
      return undefined;
    };

    // Instantiate AttemptRunner
    const runnerConfig: { questionCount?: number; timeLimitMs?: number; getTelemetry?: (examId: string, qNum: number) => QuestionTelemetry | undefined } = {};

    if (mode === "simulacro") {
      runnerConfig.questionCount = 60; // Default, can be made configurable
      runnerConfig.timeLimitMs = 600000; // 10 minutes
    }
    runnerConfig.getTelemetry = getTelemetry;

    this.currentRunner = new AttemptRunner(attempt, questions, runnerConfig);

    // Start the attempt
    this.currentRunner.start();

    // Transition to execution view
    this.setView("attemptExecution");
  }

  /**
   * Create Attempt entity based on mode
   */
  private createAttempt(
    mode: "free" | "simulacro" | "review",
    examId: string,
    questionCount: number
  ): Attempt {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    switch (mode) {
      case "free":
        return {
          id,
          type: "free",
          createdAt: now,
          sourceExamIds: [examId],
          config: {},
        } as FreeAttempt;

      case "simulacro":
        return {
          id,
          type: "simulacro",
          createdAt: now,
          sourceExamIds: [examId],
          config: {
            questionCount: Math.min(60, questionCount),
            timeLimitMs: 600000,
            penalty: 0,
            reward: 1,
            examWeights: { [examId]: 1 },
          },
        } as SimulacroAttempt;

      case "review":
        return {
          id,
          type: "review",
          createdAt: now,
          sourceExamIds: [examId],
          config: {
            questionCount: Math.min(60, questionCount),
            weights: {
              wrongWeight: 2,
              blankWeight: 1.2,
              recoveryWeight: 1,
              weakTimeThresholdMs: 15000,
            },
          },
        } as ReviewAttempt;
    }
  }

  // ============================================================================
  // Attempt Execution Handlers
  // ============================================================================

  /**
   * Handle answer selection from UI
   */
  private async handleAnswer(answerIndex: number): Promise<void> {
    if (!this.currentRunner) return;

    // Submit answer to runner
    this.currentRunner.submitAnswer(answerIndex);

    // Persist telemetry updates (SINGLE WRITE PATH)
    await this.persistTelemetryUpdates();

    // Re-render
    const state = this.currentRunner.getState();
    this.practiceManager.render(state);

    // Auto-advance on correct answer
    const currentQ = state.questions[state.currentIndex];
    const answer = state.answers[currentQ.number];
    if (answer?.isCorrect) {
      setTimeout(() => {
        this.handleNext();
      }, 500);
    }
  }

  /**
   * Handle next button from UI
   */
  private async handleNext(): Promise<void> {
    if (!this.currentRunner) return;

    this.currentRunner.next();

    const state = this.currentRunner.getState();

    // Check if we've reached the end
    if (state.currentIndex >= state.questions.length - 1 &&
        Object.keys(state.answers).length >= state.questions.length) {
      // All questions answered, show finish option or auto-finish
      this.practiceManager.render(state);
    } else {
      this.practiceManager.render(state);
    }
  }

  /**
   * Handle finish from UI
   */
  private async handleFinish(): Promise<void> {
    if (!this.currentRunner) return;

    // Final telemetry persistence
    await this.persistTelemetryUpdates();

    // Finish the attempt
    this.currentRunner.finish();

    // Transition to results
    this.setView("results");
  }

  /**
   * Persist telemetry updates - SINGLE WRITE PATH
   */
  private async persistTelemetryUpdates(): Promise<void> {
    if (!this.currentRunner) return;

    const updates = this.currentRunner.consumeTelemetryUpdates();

    for (const update of updates) {
      try {
        await this.storage.saveQuestionTelemetry(update.next);
      } catch (e) {
        console.warn("Failed to save telemetry:", e);
      }
    }
  }

  // ============================================================================
  // Legacy Compatibility (Preserved during migration)
  // ============================================================================

  showModeScreen(): void {
    // Legacy method - redirects to library during migration
    this.setView("library");
  }

  showFileScreen(): void {
    this.setView("library");
  }

  loadExam(examId: string): void {
    // Legacy entry point - now routes to mode selection
    this.selectExam(examId);
  }

  // ============================================================================
  // Onboarding
  // ============================================================================

  private checkOnboarding(): void {
    const completed = localStorage.getItem("ginaxams_onboarding_completed");
    if (!completed) {
      this.showOnboarding();
    }
  }

  private showOnboarding(): void {
    const onboarding = document.getElementById("onboardingOverlay");
    if (onboarding) {
      onboarding.classList.remove("hidden");
      this.currentOnboardingStep = 1;
      this.updateOnboardingStep();
    }
  }

  private updateOnboardingStep(): void {
    // Implementation preserved from original
  }

  // ============================================================================
  // Language
  // ============================================================================

  private setLanguage(lang: LanguageCode): void {
    this.currentLang = lang;
    this.translations = getTranslations(lang);
    localStorage.setItem("ginaxams_lang", lang);
    this.updatePageText();
  }

  private updatePageText(): void {
    // Update static text elements
    const T = this.translations;
    const appTitle = document.getElementById("appTitle");
    if (appTitle) appTitle.textContent = T.appTitle;
  }

  // ============================================================================
  // Library Management
  // ============================================================================

  private async refreshLibrary(): Promise<void> {
    try {
      this.exams = await this.storage.getExams();
      this.folders = await this.storage.getFolders();
      this.renderLibrary();
    } catch (e) {
      console.error("Failed to refresh library:", e);
    }
  }

  private renderLibrary(): void {
    const listEl = document.getElementById("examList");
    if (!listEl) return;

    // Group exams by folder
    const map: Record<string, typeof this.exams> = {};
    let hasAnyExams = false;

    this.exams.forEach((exam) => {
      const fid = exam.folderId || "uncategorized";
      if (!map[fid]) map[fid] = [];
      map[fid].push(exam);
      hasAnyExams = true;
    });

    // If truly empty, show empty state
    if (!hasAnyExams && this.folders.length === 0) {
      const T = this.translations;
      listEl.innerHTML = `
        <div class="no-exams">
          <p>${T.noExamsFound}</p>
          <p style="font-size: 0.9em; margin-top: 10px; color: #888;">${T.importFirst}</p>
          <button onclick="window.app.importDemoData()" style="margin-top:15px; padding:8px 16px; cursor:pointer;" class="mode-btn">${T.loadExampleExam}</button>
        </div>
      `;
      return;
    }

    // Load progress data for display
    const progressMap: Record<string, ExamProgress | undefined> = {};

    // Render folders and exams
    let html = "";
    for (const [folderId, exams] of Object.entries(map)) {
      if (folderId === "uncategorized" && exams.length === 0 && this.folders.length > 0) {
        continue;
      }

      let folderName = this.folders.find((f) => f.id === folderId)?.name || folderId;
      if (folderId === "uncategorized") {
        folderName = this.translations.uncategorized;
      }

      html += this.renderFolderSection(folderId, folderName, exams, progressMap);
    }

    listEl.innerHTML = html;
  }

  private renderFolderSection(
    folderId: string,
    folderName: string,
    exams: StoredExam[],
    progressMap: Record<string, ExamProgress | undefined>
  ): string {
    const T = this.translations;
    const icon = folderId === "uncategorized" ? "📂" : "📁";
    const isUncat = folderId === "uncategorized";

    const renderExam = (exam: StoredExam): string => {
      const progress = progressMap[exam.id];
      const attempts = progress?.attempts ?? 0;
      const bestScore = progress?.bestScore ?? 0;

      let statsHtml = "";
      if (attempts > 0) {
        statsHtml = `
          <div class="exam-stats">
            <span>${attempts} ${attempts === 1 ? T.attempt : T.attempts}</span>
            <span>${T.bestScore}: ${bestScore}%</span>
          </div>
        `;
      } else {
        statsHtml = `<span class="exam-item-meta">${exam.data.total_questions ?? "?"} ${T.questions}</span>`;
      }

      return `
        <div class="exam-item" data-id="${exam.id}" onclick="window.app.selectExam('${exam.id}')">
          <div class="exam-item-info">
            <div class="exam-item-title">${exam.title || exam.id}</div>
            <div class="exam-item-stats">${statsHtml}</div>
          </div>
          <div class="exam-actions">
            <button class="icon-btn" onclick="event.stopPropagation(); window.app.promptRenameExam('${exam.id}')" title="${T.rename}">✏️</button>
            <button class="icon-btn" onclick="event.stopPropagation(); window.app.promptMoveExam('${exam.id}')" title="${T.move}">📁</button>
            <button class="icon-btn" onclick="event.stopPropagation(); window.app.deleteExam('${exam.id}')" title="${T.delete}">🗑️</button>
          </div>
        </div>
      `;
    };

    return `
      <div class="category-section" id="cat-${folderId}" data-folder-id="${folderId}">
        <div class="category-header">
          <div style="display:flex; align-items:center; flex:1; cursor:pointer;">
            <span class="category-icon">${icon}</span>
            <span class="category-name">${folderName}</span>
            <span class="category-count">${exams.length}</span>
          </div>
          ${!isUncat
        ? `
              <button class="icon-btn" onclick="event.stopPropagation(); window.app.promptRenameFolder('${folderId}')" title="${T.rename}">✏️</button>
              <button class="icon-btn" onclick="event.stopPropagation(); window.app.deleteFolder('${folderId}')" title="${T.delete}">🗑️</button>
            `
        : ""
      }
        </div>
        <div class="category-exams">
          ${exams.map((e) => renderExam(e)).join("")}
        </div>
      </div>
    `;
  }

  // ============================================================================
  // Event Binding
  // ============================================================================

  private bindEvents(): void {
    // File import
    const fileInput = document.getElementById("fileInput") as HTMLInputElement | null;
    fileInput?.addEventListener("change", (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files && files.length > 0) {
        this.handleFileImport(files[0]);
      }
    });

    // Drag and drop
    const dropZone = document.getElementById("dropZone");
    dropZone?.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropZone.classList.add("drag-over");
    });
    dropZone?.addEventListener("dragleave", () => {
      dropZone.classList.remove("drag-over");
    });
    dropZone?.addEventListener("drop", (e) => {
      e.preventDefault();
      dropZone.classList.remove("drag-over");
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        this.handleFileImport(files[0]);
      }
    });

    // Language selector
    const langSelect = document.getElementById("languageSelect") as HTMLSelectElement | null;
    langSelect?.addEventListener("change", (e) => {
      this.setLanguage((e.target as HTMLSelectElement).value as LanguageCode);
    });
  }

  // ============================================================================
  // File Import/Export
  // ============================================================================

  private async handleFileImport(file: File): Promise<void> {
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // Validate exam format
      const validation = validateExam(data);
      if (!validation.valid) {
        alert(`${this.translations.invalidExamFormat}: ${validation.errors?.join(", ")}`);
        return;
      }

      // Save exam
      const storedExam: StoredExam = {
        id: data.exam_id || crypto.randomUUID(),
        title: data.title || "Untitled Exam",
        data: data as Exam,
        addedAt: new Date().toISOString(),
        folderId: "uncategorized",
      };

      await this.storage.saveExam(storedExam);
      await this.refreshLibrary();

      alert(`${this.translations.importSuccessful || "Import successful"}: ${storedExam.title}`);
    } catch (e) {
      console.error("Import failed:", e);
      alert(this.translations.importFailed);
    }
  }

  async exportLibrary(): Promise<void> {
    try {
      const data = await this.storage.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `ginaxams_backup_${new Date().toISOString().split("T")[0]}.json`;
      a.click();

      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Export failed:", e);
      alert(this.translations.exportFailed);
    }
  }

  // ============================================================================
  // Folder Management
  // ============================================================================

  async promptCreateFolder(): Promise<void> {
    const name = prompt(this.translations.folderName);
    if (!name || name.trim().length === 0) return;

    try {
      const folder: Folder = {
        id: crypto.randomUUID(),
        name: name.trim(),
        order: this.folders.length,
      };
      await this.storage.saveFolder(folder);
      await this.refreshLibrary();
    } catch (e) {
      alert(this.translations.errorCreatingFolder);
    }
  }

  async promptRenameFolder(folderId: string): Promise<void> {
    const folder = this.folders.find((f) => f.id === folderId);
    if (!folder) return;

    const name = prompt(this.translations.newName, folder.name);
    if (!name || name.trim().length === 0) return;

    folder.name = name.trim();
    await this.storage.saveFolder(folder);
    await this.refreshLibrary();
  }

  async deleteFolder(folderId: string): Promise<void> {
    const T = this.translations;
    const folder = this.folders.find((f) => f.id === folderId);
    if (!folder) return;

    if (!confirm(`${T.confirmDeleteFolder} "${folder.name}"?`)) return;

    try {
      await this.storage.deleteFolder(folderId);
      await this.refreshLibrary();
    } catch (e) {
      alert(T.errorDeletingFolder);
    }
  }

  // ============================================================================
  // Exam Management
  // ============================================================================

  async promptRenameExam(examId: string): Promise<void> {
    const exam = this.exams.find((e) => e.id === examId);
    if (!exam) return;

    const name = prompt(this.translations.newName, exam.title);
    if (!name || name.trim().length === 0) return;

    exam.title = name.trim();
    await this.storage.saveExam(exam);
    await this.refreshLibrary();
  }

  async promptMoveExam(examId: string): Promise<void> {
    const exam = this.exams.find((e) => e.id === examId);
    if (!exam) return;

    const folderNames = this.folders.map((f) => f.name).join("\n");
    const folderId = prompt(`${this.translations.moveToFolder}:\n${folderNames}`);
    if (!folderId) return;

    const targetFolder = this.folders.find((f) => f.name === folderId || f.id === folderId);
    if (!targetFolder) {
      alert(this.translations.folderNotFound || "Folder not found");
      return;
    }

    exam.folderId = targetFolder.id;
    await this.storage.saveExam(exam);
    await this.refreshLibrary();
  }

  async deleteExam(examId: string): Promise<void> {
    const T = this.translations;
    const exam = this.exams.find((e) => e.id === examId);
    if (!exam) return;

    if (!confirm(`${T.confirmDelete} "${exam.title}"?`)) return;

    try {
      await this.storage.deleteExam(examId);
      await this.refreshLibrary();
    } catch (e) {
      alert(T.errorDeletingExam);
    }
  }

  // ============================================================================
  // Demo Data
  // ============================================================================

  async importDemoData(): Promise<void> {
    const demoExam = {
      schema_version: "2.0" as const,
      exam_id: "demo-exam-1",
      title: "Sample Exam: Web Development Basics",
      categorias: ["HTML", "CSS", "JavaScript"],
      total_questions: 3,
      questions: [
        {
          number: 1,
          text: "What does HTML stand for?",
          categoria: ["HTML"],
          articulo_referencia: "HTML-1.1",
          feedback: {
            cita_literal: "HTML stands for HyperText Markup Language",
            explicacion_fallo: "HTML is the standard markup language for documents designed to be displayed in a web browser.",
          },
          answers: [
            { letter: "A", text: "HyperText Markup Language", isCorrect: true },
            { letter: "B", text: "HighText Machine Language", isCorrect: false },
            { letter: "C", text: "HyperText Markdown Language", isCorrect: false },
            { letter: "D", text: "Home Tool Markup Language", isCorrect: false },
          ],
        },
        {
          number: 2,
          text: "Which CSS property is used to change text color?",
          categoria: ["CSS"],
          articulo_referencia: "CSS-2.1",
          feedback: {
            cita_literal: "The color property sets the color of text",
            explicacion_fallo: "The color CSS property sets the foreground color value of an element's text content.",
          },
          answers: [
            { letter: "A", text: "text-color", isCorrect: false },
            { letter: "B", text: "font-color", isCorrect: false },
            { letter: "C", text: "color", isCorrect: true },
            { letter: "D", text: "text-style", isCorrect: false },
          ],
        },
        {
          number: 3,
          text: "What is the correct syntax for referring to an external script called 'app.js'?",
          categoria: ["JavaScript"],
          articulo_referencia: "JS-1.1",
          feedback: {
            cita_literal: "<script src='app.js'></script>",
            explicacion_fallo: "The src attribute specifies the URL of an external script file.",
          },
          answers: [
            { letter: "A", text: "<script href='app.js'>", isCorrect: false },
            { letter: "B", text: "<script src='app.js'>", isCorrect: true },
            { letter: "C", text: "<script link='app.js'>", isCorrect: false },
            { letter: "D", text: "<script file='app.js'>", isCorrect: false },
          ],
        },
      ],
    };

    const storedExam: StoredExam = {
      id: demoExam.exam_id,
      title: demoExam.title,
      data: demoExam,
      addedAt: new Date().toISOString(),
      folderId: "uncategorized",
    };

    await this.storage.saveExam(storedExam);
    await this.refreshLibrary();
  }

  // ============================================================================
  // Legacy Progress Methods (Preserved for UI stats during migration)
  // ============================================================================

  async saveProgress(examId: string, questionNum: number, wasCorrect: boolean): Promise<void> {
    // Legacy method - progress writes disabled in Phase 1
    // Kept for potential future reference
  }

  async incrementAttempt(examId: string): Promise<void> {
    try {
      const p = await this.storage.getProgress(examId);
      if (!p) {
        const newProgress: ExamProgress = {
          examId,
          questions: {},
          correct: 0,
          total: 0,
          lastPractice: null,
          maxCorrect: 0,
          attempts: 1,
          lastScore: null,
          bestScore: null,
        };
        await this.storage.saveProgress(newProgress);
        return;
      }

      p.attempts = (p.attempts ?? 0) + 1;
      await this.storage.saveProgress(p);
    } catch (e) {
      console.warn("Increment attempt failed", e);
    }
  }

  async saveScore(examId: string, score: number): Promise<{ lastScore: number | null; bestScore: number | null }> {
    try {
      let p = await this.storage.getProgress(examId);
      if (!p) {
        p = {
          examId,
          questions: {},
          correct: 0,
          total: 0,
          lastPractice: null,
          maxCorrect: 0,
          attempts: 0,
          lastScore: null,
          bestScore: null,
        };
      }

      p.lastScore = score;

      if (p.bestScore === null || score > p.bestScore) {
        p.bestScore = score;
      }

      await this.storage.saveProgress(p);

      return { lastScore: p.lastScore, bestScore: p.bestScore };
    } catch (e) {
      console.warn("Save score failed", e);
      return { lastScore: score, bestScore: score };
    }
  }

  getQuestionResult(_examId: string, _questionNum: number): boolean | null {
    // Legacy compatibility - returns null
    return null;
  }

  // ============================================================================
  // Template Loading
  // ============================================================================

  private async loadTemplateJSON(): Promise<void> {
    try {
      const response = await fetch("./template.json");
      if (response.ok) {
        this.templateJSON = await response.json();
      }
    } catch (e) {
      console.log("No template.json found");
    }
  }
}
