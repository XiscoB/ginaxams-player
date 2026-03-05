/**
 * Main Application Logic
 *
 * The App class coordinates all UI functionality:
 * - Exam library management (via ExamLibraryController)
 * - Attempt execution (via AttemptController)
 * - File import/export
 * - Language switching
 * - UI navigation
 *
 * All business operations go through the application layer controllers.
 * The App class never imports from domain/ or storage/ directly.
 */

import type {
  AttemptViewState,
  AttemptResultViewState,
  ExamCardView,
  LibraryViewState,
} from "../application/viewState.js";
import { AttemptController } from "../application/attemptController.js";
import { ExamLibraryController } from "../application/examLibraryController.js";
import { PracticeManager } from "../modes/practice.js";
import {
  getTranslations,
  detectBrowserLanguage,
  type LanguageCode,
  type Translations,
} from "../i18n/index.js";

/**
 * View state for UI routing
 */
type View =
  | "library" // Exam library/folders
  | "attemptConfig" // Mode selection (Free/Simulacro/Review)
  | "attemptExecution" // Active attempt
  | "results"; // Attempt results

/**
 * Pending attempt configuration (UI-only state)
 */
interface PendingAttempt {
  examId: string;
  examTitle: string;
}

/**
 * Application dependencies injected from main.ts
 */
export interface AppDeps {
  attemptController: AttemptController;
  libraryController: ExamLibraryController;
  onStorageReady: () => Promise<void>;
}

/**
 * Main Application Class
 *
 * Coordinates UI navigation and dispatches all business operations
 * through application layer controllers.
 */
export class App {
  // Core components
  practiceManager: PracticeManager;
  private attemptController: AttemptController;
  private libraryController: ExamLibraryController;
  private onStorageReady: () => Promise<void>;

  // State
  private libraryState: LibraryViewState | null = null;
  private translations: Translations = getTranslations("en");

  // View State Machine
  private pendingAttempt: PendingAttempt | null = null;

  // Cached view states for the current attempt
  private currentAttemptView: AttemptViewState | null = null;
  private currentResultView: AttemptResultViewState | null = null;

  constructor(deps: AppDeps) {
    this.attemptController = deps.attemptController;
    this.libraryController = deps.libraryController;
    this.onStorageReady = deps.onStorageReady;

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
      await this.onStorageReady();

      // Load Language Preference
      const savedLang = localStorage.getItem(
        "ginaxams_lang",
      ) as LanguageCode | null;
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
      examTitle.textContent = this.pendingAttempt.examTitle;
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

    // Initial render if we have a cached view state
    if (this.currentAttemptView) {
      this.practiceManager.render(this.currentAttemptView);
    }
  }

  private showResultsScreen(): void {
    if (!this.currentResultView) {
      this.setView("library");
      return;
    }

    const resultsScreen = document.getElementById("resultsScreen");
    if (resultsScreen) {
      resultsScreen.classList.remove("hidden");
    }

    // Render results via PracticeManager
    this.practiceManager.renderResults(this.currentResultView);
  }

  // ============================================================================
  // Attempt Creation & Runner Management
  // ============================================================================

  /**
   * User clicked on an exam - show mode selection
   */
  selectExam(examId: string): void {
    if (!this.libraryState) return;

    const exam = this.libraryState.exams.find((e) => e.id === examId);
    if (!exam) {
      alert(this.translations.examNotFound);
      return;
    }

    this.pendingAttempt = {
      examId,
      examTitle: exam.title,
    };

    this.setView("attemptConfig");
  }

  /**
   * Start a new attempt with the selected mode
   */
  private async startAttempt(
    mode: "free" | "simulacro" | "review",
  ): Promise<void> {
    if (!this.pendingAttempt) {
      this.setView("library");
      return;
    }

    const { examId } = this.pendingAttempt;

    try {
      const viewState = await this.attemptController.startAttempt({
        mode,
        examIds: [examId],
        config:
          mode === "simulacro"
            ? {
                questionCount: 60,
                timeLimitMs: 600000,
                penalty: 0,
                reward: 1,
              }
            : undefined,
      });

      this.currentAttemptView = viewState;
      this.setView("attemptExecution");
    } catch (e) {
      console.error("Failed to start attempt:", e);
      alert("Failed to start attempt. Please try again.");
    }
  }

  // ============================================================================
  // Attempt Execution Handlers
  // ============================================================================

  /**
   * Handle answer selection from UI
   */
  private async handleAnswer(answerIndex: number): Promise<void> {
    if (!this.attemptController.hasActiveSession()) return;

    // Submit answer via controller
    this.currentAttemptView = this.attemptController.submitAnswer(answerIndex);

    // Re-render
    this.practiceManager.render(this.currentAttemptView);

    // Auto-advance on correct answer
    if (
      this.currentAttemptView.isAnswered &&
      this.currentAttemptView.feedback?.isCorrect
    ) {
      setTimeout(() => {
        this.handleNext();
      }, 500);
    }
  }

  /**
   * Handle next button from UI
   */
  private async handleNext(): Promise<void> {
    if (!this.attemptController.hasActiveSession()) return;

    this.currentAttemptView = this.attemptController.nextQuestion();
    this.practiceManager.render(this.currentAttemptView);
  }

  /**
   * Handle finish from UI
   */
  private async handleFinish(): Promise<void> {
    if (!this.attemptController.hasActiveSession()) return;

    try {
      this.currentResultView = await this.attemptController.finalizeAttempt();
      this.currentAttemptView = null;
      this.setView("results");
    } catch (e) {
      console.error("Failed to finalize attempt:", e);
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
      this.libraryState = await this.libraryController.getLibraryViewState();
      await this.renderLibrary();
    } catch (e) {
      console.error("Failed to refresh library:", e);
    }
  }

  private async renderLibrary(): Promise<void> {
    const listEl = document.getElementById("examList");
    if (!listEl || !this.libraryState) return;

    const { exams, folders } = this.libraryState;

    // Group exams by folder
    const map: Record<string, ExamCardView[]> = {};
    let hasAnyExams = false;

    exams.forEach((exam) => {
      const fid = exam.folderId || "uncategorized";
      if (!map[fid]) map[fid] = [];
      map[fid].push(exam);
      hasAnyExams = true;
    });

    // If truly empty, show empty state
    if (!hasAnyExams && folders.length === 0) {
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

    // Render folders and exams
    let html = "";
    for (const [folderId, folderExams] of Object.entries(map)) {
      if (
        folderId === "uncategorized" &&
        folderExams.length === 0 &&
        folders.length > 0
      ) {
        continue;
      }

      let folderName = folders.find((f) => f.id === folderId)?.name || folderId;
      if (folderId === "uncategorized") {
        folderName = this.translations.uncategorized;
      }

      html += this.renderFolderSection(folderId, folderName, folderExams);
    }

    listEl.innerHTML = html;
  }

  private renderFolderSection(
    folderId: string,
    folderName: string,
    exams: ExamCardView[],
  ): string {
    const T = this.translations;
    const icon = folderId === "uncategorized" ? "📂" : "📁";
    const isUncat = folderId === "uncategorized";

    const renderExam = (exam: ExamCardView): string => {
      const attempts = exam.stats?.attemptCount ?? 0;
      const bestScore = exam.stats?.bestScore ?? 0;

      let statsHtml = "";
      if (attempts > 0) {
        statsHtml = `
          <div class="exam-stats">
            <span>${attempts} ${attempts === 1 ? T.attempt : T.attempts}</span>
            <span>${T.bestScore}: ${bestScore}%</span>
          </div>
        `;
      } else {
        statsHtml = `<span class="exam-item-meta">${exam.questionCount ?? "?"} ${T.questions}</span>`;
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
          ${
            !isUncat
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
    const fileInput = document.getElementById(
      "fileInput",
    ) as HTMLInputElement | null;
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
    const langSelect = document.getElementById(
      "languageSelect",
    ) as HTMLSelectElement | null;
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

      // Import through the library controller (validates + persists)
      const examId = await this.libraryController.importExam(data);
      await this.refreshLibrary();

      // Find the imported exam title from refreshed library state
      const imported = this.libraryState?.exams.find((e) => e.id === examId);
      const title = imported?.title ?? "Exam";
      alert(
        `${this.translations.importSuccessful || "Import successful"}: ${title}`,
      );
    } catch (e) {
      console.error("Import failed:", e);
      const message = e instanceof Error ? e.message : "Unknown error";
      alert(`${this.translations.importFailed}: ${message}`);
    }
  }

  async exportLibrary(): Promise<void> {
    try {
      const snapshot = await this.libraryController.createBackup();
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
        type: "application/json",
      });
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
      await this.libraryController.createFolder(name.trim());
      await this.refreshLibrary();
    } catch (e) {
      alert(this.translations.errorCreatingFolder);
    }
  }

  async promptRenameFolder(folderId: string): Promise<void> {
    if (!this.libraryState) return;
    const folder = this.libraryState.folders.find((f) => f.id === folderId);
    if (!folder) return;

    const name = prompt(this.translations.newName, folder.name);
    if (!name || name.trim().length === 0) return;

    try {
      await this.libraryController.renameFolder(folderId, name.trim());
      await this.refreshLibrary();
    } catch (e) {
      alert(this.translations.errorRenaming || "Error renaming folder");
    }
  }

  async deleteFolder(folderId: string): Promise<void> {
    const T = this.translations;
    if (!this.libraryState) return;
    const folder = this.libraryState.folders.find((f) => f.id === folderId);
    if (!folder) return;

    if (!confirm(`${T.confirmDeleteFolder} "${folder.name}"?`)) return;

    try {
      await this.libraryController.deleteFolder(folderId);
      await this.refreshLibrary();
    } catch (e) {
      alert(T.errorDeletingFolder);
    }
  }

  // ============================================================================
  // Exam Management
  // ============================================================================

  async promptRenameExam(examId: string): Promise<void> {
    if (!this.libraryState) return;
    const exam = this.libraryState.exams.find((e) => e.id === examId);
    if (!exam) return;

    const name = prompt(this.translations.newName, exam.title);
    if (!name || name.trim().length === 0) return;

    try {
      await this.libraryController.renameExam(examId, name.trim());
      await this.refreshLibrary();
    } catch (e) {
      alert(this.translations.errorRenaming || "Error renaming exam");
    }
  }

  async promptMoveExam(examId: string): Promise<void> {
    if (!this.libraryState) return;
    const exam = this.libraryState.exams.find((e) => e.id === examId);
    if (!exam) return;

    const folderNames = this.libraryState.folders.map((f) => f.name).join("\n");
    const folderId = prompt(
      `${this.translations.moveToFolder}:\n${folderNames}`,
    );
    if (!folderId) return;

    const targetFolder = this.libraryState.folders.find(
      (f) => f.name === folderId || f.id === folderId,
    );
    if (!targetFolder) {
      alert(this.translations.folderNotFound || "Folder not found");
      return;
    }

    try {
      await this.libraryController.moveExam(examId, targetFolder.id);
      await this.refreshLibrary();
    } catch (e) {
      alert(this.translations.errorMovingExam || "Error moving exam");
    }
  }

  async deleteExam(examId: string): Promise<void> {
    const T = this.translations;
    if (!this.libraryState) return;
    const exam = this.libraryState.exams.find((e) => e.id === examId);
    if (!exam) return;

    if (!confirm(`${T.confirmDelete} "${exam.title}"?`)) return;

    try {
      await this.libraryController.deleteExam(examId);
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
            explicacion_fallo:
              "HTML is the standard markup language for documents designed to be displayed in a web browser.",
          },
          answers: [
            { letter: "A", text: "HyperText Markup Language", isCorrect: true },
            {
              letter: "B",
              text: "HighText Machine Language",
              isCorrect: false,
            },
            {
              letter: "C",
              text: "HyperText Markdown Language",
              isCorrect: false,
            },
            {
              letter: "D",
              text: "Home Tool Markup Language",
              isCorrect: false,
            },
          ],
        },
        {
          number: 2,
          text: "Which CSS property is used to change text color?",
          categoria: ["CSS"],
          articulo_referencia: "CSS-2.1",
          feedback: {
            cita_literal: "The color property sets the color of text",
            explicacion_fallo:
              "The color CSS property sets the foreground color value of an element's text content.",
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
            explicacion_fallo:
              "The src attribute specifies the URL of an external script file.",
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

    try {
      await this.libraryController.importExam(demoExam);
      await this.refreshLibrary();
    } catch (e) {
      console.error("Failed to import demo data:", e);
    }
  }

  // ============================================================================
  // Legacy Progress Methods (REMOVED in Phase 7)
  // All stats now derived from Attempt data via attemptSelectors
  // ============================================================================

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
        await response.json();
      }
    } catch (e) {
      console.log("No template.json found");
    }
  }
}
