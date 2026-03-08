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
import {
  createPracticeSessionUiState,
  type PracticeSessionUiState,
} from "../application/viewState.js";
import { AttemptController } from "../application/attemptController.js";
import { ExamLibraryController } from "../application/examLibraryController.js";
import { DuplicateExamError } from "../application/examLibraryController.js";
import { SettingsService } from "../application/settingsService.js";
import type { TabId } from "../application/settingsService.js";
import { PracticeManager } from "../modes/practice.js";
import {
  computeNavigatorItems,
  computeReviewNavigatorItems,
  renderReviewNavigator,
  findNextWrongIndex,
  findNextBlankIndex,
  type ReviewNavigatorItem,
  type QuestionResultState,
} from "../ui/practice/buildQuestionNavigator.js";
import {
  computeSummaryData,
  renderSummaryModal,
} from "../ui/practice/buildQuestionSummaryModal.js";
import { attachKeyboardShortcuts } from "../ui/practice/buildKeyboardShortcuts.js";
import {
  getTranslations,
  detectBrowserLanguage,
  type LanguageCode,
  type Translations,
} from "../i18n/index.js";
import { renderInsightsView } from "../ui/views/InsightsView.js";
import { renderTelemetryView } from "../ui/views/TelemetryView.js";
import { createViewLoading, createViewError } from "../ui/components/ViewStatus.js";
import { APP_VERSION } from "../application/version.js";
import {
  downloadAsJson,
  copyJsonToClipboard,
  shareJson,
  canShareFiles,
} from "../application/exportUtils.js";

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
  settingsService: SettingsService;
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
  private settingsService: SettingsService;
  private onStorageReady: () => Promise<void>;

  // State
  private libraryState: LibraryViewState | null = null;
  private translations: Translations = getTranslations("en");
  private _currentLang: LanguageCode = "en";
  get currentLang(): LanguageCode {
    return this._currentLang;
  }

  // View State Machine
  private pendingAttempt: PendingAttempt | null = null;

  // Cached view states for the current attempt
  private currentAttemptView: AttemptViewState | null = null;
  private currentResultView: AttemptResultViewState | null = null;
  private simulacroTimerInterval: ReturnType<typeof setInterval> | null = null;
  private timerVisible = true;

  // Practice session UI state (Phase 13)
  private practiceUiState: PracticeSessionUiState = createPracticeSessionUiState();
  private cleanupKeyboardShortcuts: (() => void) | null = null;

  // Onboarding state
  private onboardingStep = 1;
  private readonly totalOnboardingSteps = 5;

  // External link pending
  private pendingExternalUrl = "";
  private pendingExternalName = "";

  constructor(deps: AppDeps) {
    this.attemptController = deps.attemptController;
    this.libraryController = deps.libraryController;
    this.settingsService = deps.settingsService;
    this.onStorageReady = deps.onStorageReady;

    // Initialize PracticeManager as dumb renderer
    this.practiceManager = new PracticeManager({
      onAnswer: (answerIndex: number) => this.handleAnswer(answerIndex),
      onNext: () => this.handleNext(),
      onPrevious: () => this.handlePrevious(),
      onGoTo: (index: number) => this.handleGoTo(index),
      onFlag: () => this.handleFlag(),
      onFinish: () => this.handleFinishRequest(),
      getTranslations: () => this.translations,
      getFlaggedQuestions: () => this.practiceUiState.flaggedQuestions,
      getAnsweredIndices: () => this.getAnsweredIndicesSet(),
    });

    this.init();
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  private async init(): Promise<void> {
    try {
      await this.onStorageReady();

      // Load persisted settings (Phase 16)
      const settings = await this.settingsService.load();

      // Load Language Preference — prefer persisted IndexedDB setting,
      // fall back to localStorage (legacy), then browser detection
      const savedLang = (settings.language ||
        localStorage.getItem("ginaxams_lang") ||
        null) as LanguageCode | null;
      const detectedLang = detectBrowserLanguage();
      this.setLanguage(savedLang || detectedLang);

      // Restore last opened tab (Phase 16)
      this.activeLibraryTab = settings.lastOpenedTab || "library";

      // Load template JSON for display
      await this.loadTemplateJSON();

      // Initial Load
      await this.refreshLibrary();

      // Auto-load example exam on first run (empty database)
      await this.autoLoadExampleExam();

      this.bindEvents();
      this.setView("library");

      // Show onboarding for first-time users
      this.checkOnboarding();

      // Render version footer (Phase 17)
      this.renderVersionFooter();
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
    // Reset to library tab and show appropriate state
    this.showLibraryTab(this.activeLibraryTab);
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
        <div class="mode-cards-container">
          <div class="mode-card mode-card--free">
            <div class="mode-card__header">
              <span class="mode-card__icon">📚</span>
              <span class="mode-card__title">${T.freeMode || "Free Mode"}</span>
            </div>
            <div class="mode-card__desc">
              <span>${T.freeModeDesc || "Practice at your own pace with full exam"}</span>
              <span style="color: var(--text-muted); font-size: 0.85em;">${T.modeFreeDescription || "No telemetry tracking"}</span>
            </div>
            <div class="mode-card__actions">
              <button id="btnFreeMode" class="btn btn--primary">${T.modeStartButton || "Start"}</button>
            </div>
          </div>
          <div class="mode-card mode-card--simulacro">
            <div class="mode-card__header">
              <span class="mode-card__icon">⏱️</span>
              <span class="mode-card__title">${T.simulacroMode || "Simulacro"}</span>
            </div>
            <div class="mode-card__desc">
              <span>${T.simulacroModeDesc || "Timed exam simulation"}</span>
              <span style="color: var(--text-muted); font-size: 0.85em;">${T.modeSimulacroDescription || "Configurable timer"}</span>
            </div>
            <div class="mode-card__config" style="margin-top: var(--space-sm);">
              <label style="display: block; margin-bottom: var(--space-xs); color: var(--text-secondary); font-size: 0.85em;">${T.timerConfig || "Timer Duration"}</label>
              <select id="simulacroTimerSelect" class="config-select" style="width: 100%; padding: 8px; border-radius: var(--radius-sm); background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border-color); font-size: 0.9em; margin-bottom: var(--space-sm);">
                <option value="0">${T.timerNoLimit || "No timer"}</option>
                <option value="1800000">${T.timer30 || "30 minutes"}</option>
                <option value="3600000" selected>${T.timer60 || "60 minutes"}</option>
                <option value="5400000">${T.timer90 || "90 minutes"}</option>
              </select>
              <label style="display: flex; align-items: center; gap: var(--space-xs); color: var(--text-secondary); font-size: 0.85em; cursor: pointer;">
                <input type="checkbox" id="simulacroShowExplanations" />
                ${T.showFeedbackToggle || "Show feedback during exam"}
              </label>
            </div>
            <div class="mode-card__actions">
              <button id="btnSimulacroMode" class="btn btn--primary">${T.modeStartButton || "Start"}</button>
            </div>
          </div>
          <div class="mode-card mode-card--review">
            <div class="mode-card__header">
              <span class="mode-card__icon">🎯</span>
              <span class="mode-card__title">${T.reviewMode || "Review Mode"}</span>
            </div>
            <div class="mode-card__desc">
              <span>${T.reviewModeDesc || "Focus on weak questions"}</span>
              <span style="color: var(--text-muted); font-size: 0.85em;">${T.modeReviewDescription || "Adaptive practice"}</span>
            </div>
            <div class="mode-card__actions">
              <button id="btnReviewMode" class="btn btn--primary">${T.modeStartButton || "Start"}</button>
            </div>
          </div>
        </div>
        <button id="btnBackToLibrary" class="btn btn--secondary" style="width:100%;">${T.back || "Back"}</button>
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

    // Show/hide timer area based on mode
    const timerArea = document.getElementById("simulacroTimerArea");
    if (timerArea) {
      const isSimulacro =
        this.currentAttemptView?.mode === "simulacro" &&
        this.currentAttemptView?.timer;
      if (isSimulacro) {
        timerArea.classList.remove("hidden");
        timerArea.style.display = "flex";
        this.timerVisible = true;
        this.updateTimerVisibility();
      } else {
        timerArea.classList.add("hidden");
        timerArea.style.display = "none";
      }
    }

    // Reset feedback tracking for new attempt
    this.practiceManager.resetFeedbackState();

    // Initial render if we have a cached view state
    if (this.currentAttemptView) {
      this.practiceManager.render(this.currentAttemptView);
      this.renderSimulacroTimer();
    }
  }

  /**
   * Render the simulacro timer display.
   */
  private renderSimulacroTimer(): void {
    if (!this.currentAttemptView?.timer) return;

    const timerDisplay = document.getElementById("simulacroTimerDisplay");
    if (!timerDisplay) return;

    const remainingMs = this.currentAttemptView.timer.remainingMs;
    const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    timerDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }

  private async showResultsScreen(): Promise<void> {
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

    // Populate last/best score from attempt history
    await this.populateScoreComparison();

    // Bind results action buttons
    const btnTryAgain = document.getElementById("btnTryAgain");
    if (btnTryAgain) {
      btnTryAgain.onclick = () => {
        this.currentResultView = null;
        if (this.pendingAttempt) {
          this.setView("attemptConfig");
        } else {
          this.setView("library");
        }
      };
    }

    const btnReviewAnswers = document.getElementById("btnReviewAnswers");
    if (btnReviewAnswers) {
      btnReviewAnswers.onclick = () => {
        this.showReviewScreen();
      };
    }
  }

  /**
   * Populate the Last Score / Best Score comparison on the results screen
   * from stored attempt data via the library controller.
   */
  private async populateScoreComparison(): Promise<void> {
    const T = this.translations;
    const lastScoreEl = document.getElementById("lastScoreValue");
    const bestScoreEl = document.getElementById("bestScoreValue");

    if (!lastScoreEl || !bestScoreEl) return;

    // Refresh library to get updated stats after the attempt was persisted
    try {
      await this.refreshLibrary();
    } catch {
      // If refresh fails, just show dashes
    }

    if (this.pendingAttempt && this.libraryState) {
      const exam = this.libraryState.exams.find(
        (e) => e.id === this.pendingAttempt!.examId,
      );
      if (exam?.stats) {
        lastScoreEl.textContent =
          exam.stats.lastScore !== undefined
            ? `${exam.stats.lastScore}%`
            : T.notAttempted || "-";
        bestScoreEl.textContent =
          exam.stats.bestScore !== undefined
            ? `${exam.stats.bestScore}%`
            : T.notAttempted || "-";
        return;
      }
    }

    lastScoreEl.textContent = T.notAttempted || "-";
    bestScoreEl.textContent = T.notAttempted || "-";
  }

  private showReviewScreen(): void {
    if (!this.currentResultView) return;

    this.hideAllScreens();
    const reviewScreen = document.getElementById("reviewScreen");
    if (reviewScreen) {
      reviewScreen.classList.remove("hidden");
    }

    // Update review screen translation labels
    const T = this.translations;
    const txtBackReview = document.getElementById("txtBackReview");
    if (txtBackReview)
      txtBackReview.textContent = T.reviewBack || T.back || "Back";
    const txtReviewPrev = document.getElementById("txtReviewPrevious");
    if (txtReviewPrev) txtReviewPrev.textContent = T.reviewPrev || "← Prev";
    const txtReviewNext = document.getElementById("txtReviewNext");
    if (txtReviewNext) txtReviewNext.textContent = T.reviewNext || "Next →";

    // Update jump button labels
    const txtNextWrong = document.getElementById("txtNextWrong");
    if (txtNextWrong) txtNextWrong.textContent = `❌ ${T.nextWrongQuestion || "Next Wrong"}`;
    const txtNextBlank = document.getElementById("txtNextBlank");
    if (txtNextBlank) txtNextBlank.textContent = `⬜ ${T.nextBlankQuestion || "Next Blank"}`;

    this.buildReviewNavItems();
    this.renderReviewScreenContent("all");

    // Bind filter buttons
    const filterAll = document.getElementById("filterAll");
    const filterWrong = document.getElementById("filterWrong");

    if (filterAll) {
      filterAll.onclick = () => {
        filterAll.classList.add("active");
        filterWrong?.classList.remove("active");
        this.renderReviewScreenContent("all");
      };
    }

    if (filterWrong) {
      filterWrong.onclick = () => {
        filterWrong.classList.add("active");
        filterAll?.classList.remove("active");
        this.renderReviewScreenContent("wrong");
      };
    }
  }

  private reviewCurrentIndex = 0;
  private reviewFilteredQuestions: typeof this.currentResultView extends null
    ? never
    : NonNullable<typeof this.currentResultView>["questionSummary"] = [];
  /** Cached review navigator items for the current result view */
  private reviewNavItems: ReviewNavigatorItem[] = [];

  /**
   * Build review navigator items from the current result view's question summary.
   * Uses flagged questions from the practice UI state.
   */
  private buildReviewNavItems(): void {
    if (!this.currentResultView) {
      this.reviewNavItems = [];
      return;
    }

    const results: QuestionResultState[] =
      this.currentResultView.questionSummary.map((q) => ({
        isCorrect: q.isCorrect,
        isBlank: q.isBlank,
        isFlagged: this.practiceUiState.flaggedQuestions.has(
          this.currentResultView!.questionSummary.indexOf(q),
        ),
      }));

    this.reviewNavItems = computeReviewNavigatorItems(results, this.reviewCurrentIndex);
  }

  /**
   * Render (or re-render) the review navigator grid.
   */
  private renderReviewNavigator(): void {
    const container = document.getElementById("reviewMinimapContainer");
    if (!container || this.reviewNavItems.length === 0) return;

    // Recompute items with current index to update the "current" state
    if (this.currentResultView) {
      const results: QuestionResultState[] =
        this.currentResultView.questionSummary.map((q, i) => ({
          isCorrect: q.isCorrect,
          isBlank: q.isBlank,
          isFlagged: this.practiceUiState.flaggedQuestions.has(i),
        }));
      this.reviewNavItems = computeReviewNavigatorItems(results, this.reviewCurrentIndex);
    }

    renderReviewNavigator(container, this.reviewNavItems, (index) => {
      this.reviewCurrentIndex = index;
      this.renderReviewQuestion();
      this.renderReviewNavigator();
      this.scrollReviewQuestionIntoView();
    });
  }

  /**
   * Scroll the review question card into view.
   */
  private scrollReviewQuestionIntoView(): void {
    const questionCard = document.querySelector("#reviewScreen .question-card");
    if (questionCard) {
      questionCard.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  private renderReviewScreenContent(filter: "all" | "wrong"): void {
    if (!this.currentResultView) return;

    const T = this.translations;
    const summary = this.currentResultView.questionSummary;
    const filtered =
      filter === "all"
        ? summary
        : summary.filter((q) => !q.isCorrect && !q.isBlank);

    this.reviewFilteredQuestions = filtered;
    this.reviewCurrentIndex = 0;
    this.renderReviewQuestion();
    this.renderReviewNavigator();

    if (filtered.length === 0) {
      const questionText = document.getElementById("reviewQuestionText");
      if (questionText) {
        questionText.textContent =
          filter === "wrong"
            ? T.noWrongAnswers || "No wrong answers to review"
            : T.noQuestionsMatch || "No questions match this filter!";
      }
    }
  }

  private renderReviewQuestion(): void {
    if (!this.currentResultView) return;

    const T = this.translations;
    const filtered = this.reviewFilteredQuestions;

    if (filtered.length === 0) return;

    const q = filtered[this.reviewCurrentIndex];
    if (!q) return;

    const questionNumber = document.getElementById("reviewQuestionNumber");
    if (questionNumber) {
      questionNumber.textContent = `${T.question || "Question"} ${q.questionNumber}`;
    }

    const questionText = document.getElementById("reviewQuestionText");
    if (questionText) {
      questionText.textContent = q.questionText;
    }

    const correctText = document.getElementById("correctAnswerText");
    if (correctText) {
      const label = T.correctAnswerLabel || "Correct answer";
      correctText.textContent = q.correctAnswerText
        ? `${label}: ${q.correctAnswerLetter} — ${q.correctAnswerText}`
        : `${label}: ${q.correctAnswerLetter}`;
    }

    // Update progress
    const progressText = document.getElementById("reviewProgressText");
    if (progressText) {
      progressText.textContent = `${this.reviewCurrentIndex + 1}/${filtered.length}`;
    }

    const progressBar = document.getElementById("reviewProgressBar");
    if (progressBar) {
      const pct =
        filtered.length > 0
          ? ((this.reviewCurrentIndex + 1) / filtered.length) * 100
          : 0;
      progressBar.style.width = `${pct}%`;
    }

    // Render feedback panel (explanation, citation, reference)
    const reviewFeedback = document.getElementById("reviewFeedbackSection");
    if (reviewFeedback) {
      this.practiceManager.renderFeedbackPanel(reviewFeedback, q, T);
    }
  }

  /**
   * Navigate back from review screen to results screen.
   */
  backToResults(): void {
    this.setView("results");
  }

  /**
   * Navigate to previous question in review screen.
   */
  reviewPrevQuestion(): void {
    if (this.reviewCurrentIndex > 0) {
      this.reviewCurrentIndex--;
      this.renderReviewQuestion();
      this.renderReviewNavigator();
      this.scrollReviewQuestionIntoView();
    }
  }

  /**
   * Navigate to next question in review screen.
   */
  reviewNextQuestion(): void {
    if (this.reviewCurrentIndex < this.reviewFilteredQuestions.length - 1) {
      this.reviewCurrentIndex++;
      this.renderReviewQuestion();
      this.renderReviewNavigator();
      this.scrollReviewQuestionIntoView();
    }
  }

  /**
   * Jump to the next wrong question in the review screen.
   */
  reviewNextWrong(): void {
    if (!this.currentResultView) return;
    const idx = findNextWrongIndex(this.reviewNavItems, this.reviewCurrentIndex);
    if (idx >= 0) {
      this.reviewCurrentIndex = idx;
      this.renderReviewQuestion();
      this.renderReviewNavigator();
      this.scrollReviewQuestionIntoView();
    }
  }

  /**
   * Jump to the next blank question in the review screen.
   */
  reviewNextBlank(): void {
    if (!this.currentResultView) return;
    const idx = findNextBlankIndex(this.reviewNavItems, this.reviewCurrentIndex);
    if (idx >= 0) {
      this.reviewCurrentIndex = idx;
      this.renderReviewQuestion();
      this.renderReviewNavigator();
      this.scrollReviewQuestionIntoView();
    }
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
      // Read simulacro timer config from UI
      let timeLimitMs = 3600000; // default 60 minutes
      let showExplanations = false;
      if (mode === "simulacro") {
        const timerSelect = document.getElementById(
          "simulacroTimerSelect",
        ) as HTMLSelectElement | null;
        if (timerSelect) {
          timeLimitMs = parseInt(timerSelect.value, 10);
        }
        const explCheckbox = document.getElementById(
          "simulacroShowExplanations",
        ) as HTMLInputElement | null;
        if (explCheckbox) {
          showExplanations = explCheckbox.checked;
        }
      }

      const viewState = await this.attemptController.startAttempt({
        mode,
        examIds: [examId],
        config:
          mode === "simulacro"
            ? {
                questionCount: 60,
                timeLimitMs,
                penalty: 0,
                reward: 1,
                showExplanations,
              }
            : undefined,
      });

      this.currentAttemptView = viewState;
      this.initPracticeSession();
      this.setView("attemptExecution");

      // Start simulacro timer if needed
      if (mode === "simulacro") {
        this.startSimulacroTimer();
      }
    } catch (e) {
      console.error("Failed to start attempt:", e);
      alert("Failed to start attempt. Please try again.");
    }
  }

  // ============================================================================
  // Simulacro Timer
  // ============================================================================

  private startSimulacroTimer(): void {
    this.stopSimulacroTimer();
    this.timerVisible = true;

    // If no time limit (timeLimitMs = 0), don't start a timer
    if (this.currentAttemptView?.timer?.totalMs === 0) {
      return;
    }

    const TICK_INTERVAL = 1000;
    this.simulacroTimerInterval = setInterval(() => {
      if (!this.attemptController.hasActiveSession()) {
        this.stopSimulacroTimer();
        return;
      }

      this.currentAttemptView = this.attemptController.tick(TICK_INTERVAL);
      this.practiceManager.render(this.currentAttemptView);

      // Update timer display
      this.renderSimulacroTimer();

      // Update timer display visibility
      this.updateTimerVisibility();

      // Auto-finalize when timer expires
      if (this.currentAttemptView.isFinished) {
        this.stopSimulacroTimer();
        this.handleFinish();
      }
    }, TICK_INTERVAL);
  }

  private stopSimulacroTimer(): void {
    if (this.simulacroTimerInterval !== null) {
      clearInterval(this.simulacroTimerInterval);
      this.simulacroTimerInterval = null;
    }
  }

  /**
   * Toggle timer visibility during simulacro mode.
   * Timer continues running even when hidden.
   */
  toggleTimerVisibility(): void {
    this.timerVisible = !this.timerVisible;
    this.updateTimerVisibility();
  }

  /**
   * Update the timer display and toggle button based on visibility state.
   */
  private updateTimerVisibility(): void {
    const T = this.translations;
    const timerDisplay = document.getElementById("simulacroTimerDisplay");
    const timerToggle = document.getElementById("timerToggleBtn");

    if (timerDisplay) {
      timerDisplay.style.visibility = this.timerVisible ? "visible" : "hidden";
    }
    if (timerToggle) {
      timerToggle.textContent = this.timerVisible
        ? T.hideTimer || "Hide Timer"
        : T.showTimer || "Show Timer";
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

    // Track answered index for navigator
    const answeredIndex = this.currentAttemptView.progress.current - 1;
    this._answeredIndicesCache.add(answeredIndex);

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
    // Clear feedback state before rendering to prevent stale feedback flash
    this.practiceManager.resetFeedbackState();
    this.practiceManager.render(this.currentAttemptView);
  }

  /**
   * Handle previous button from UI
   */
  private handlePrevious(): void {
    if (!this.attemptController.hasActiveSession()) return;

    this.currentAttemptView = this.attemptController.previousQuestion();
    this.practiceManager.resetFeedbackState();
    this.practiceManager.render(this.currentAttemptView);
  }

  /**
   * Handle navigator jump to question
   */
  private handleGoTo(index: number): void {
    if (!this.attemptController.hasActiveSession()) return;

    this.currentAttemptView = this.attemptController.goToQuestion(index);
    this.practiceManager.resetFeedbackState();
    this.practiceManager.render(this.currentAttemptView);
  }

  /**
   * Handle flag toggle for current question
   */
  private handleFlag(): void {
    if (!this.currentAttemptView) return;

    const currentIndex = this.currentAttemptView.progress.current - 1;
    const flags = this.practiceUiState.flaggedQuestions;

    if (flags.has(currentIndex)) {
      flags.delete(currentIndex);
    } else {
      flags.add(currentIndex);
    }

    // Re-render to update flag button and navigator
    this.practiceManager.render(this.currentAttemptView);
  }

  /**
   * Handle finish request — show summary modal before actual submission.
   */
  private handleFinishRequest(): void {
    if (!this.attemptController.hasActiveSession()) {
      this.handleFinish();
      return;
    }

    if (!this.currentAttemptView) {
      this.handleFinish();
      return;
    }

    // Compute summary data
    const state = this.currentAttemptView;
    const answeredIndices = this.getAnsweredIndicesSet();
    const flaggedIndices = this.practiceUiState.flaggedQuestions;

    const navigatorItems = computeNavigatorItems(
      state.progress.total,
      state.progress.current - 1,
      answeredIndices,
      flaggedIndices,
    );

    const summaryData = computeSummaryData(
      state.progress.total,
      answeredIndices.size,
      flaggedIndices.size,
    );

    // Show summary modal
    renderSummaryModal(
      summaryData,
      navigatorItems,
      {
        onJump: (index) => {
          this.handleGoTo(index);
        },
        onSubmit: () => {
          this.handleFinish();
        },
        onReturn: () => {
          // Just close modal — user returns to current question
        },
      },
      this.translations,
    );
  }

  /**
   * Handle finish from UI
   */
  private async handleFinish(): Promise<void> {
    this.stopSimulacroTimer();
    this.cleanupPracticeSession();

    if (!this.attemptController.hasActiveSession()) {
      // Called from results screen "Try Again" — restart the same exam
      if (this.pendingAttempt) {
        this.setView("attemptConfig");
      } else {
        this.setView("library");
      }
      return;
    }

    try {
      this.currentResultView = await this.attemptController.finalizeAttempt();
      this.currentAttemptView = null;
      this.setView("results");
    } catch (e) {
      console.error("Failed to finalize attempt:", e);
    }
  }

  // ============================================================================
  // Practice Session Helpers (Phase 13)
  // ============================================================================

  /**
   * Get the set of 0-based indices of answered questions in the current attempt.
   */
  private getAnsweredIndicesSet(): ReadonlySet<number> {
    if (!this.currentAttemptView) return new Set();

    // The navigator items get rendered from the view state, so we track
    // answered status based on the progress.answered count and the current
    // index being answered.
    //
    // Better approach: iterate through all questions and check if they've
    // been answered by getting the full state from the controller.
    // For efficiency, use a cached set maintained by handleAnswer.
    return this._answeredIndicesCache;
  }

  /** Cache of answered question indices (0-based) */
  private _answeredIndicesCache: Set<number> = new Set();

  /**
   * Initialize a new practice session UI state.
   * Called when starting a new attempt.
   */
  private initPracticeSession(): void {
    this.practiceUiState = createPracticeSessionUiState();
    this._answeredIndicesCache = new Set();

    // Attach keyboard shortcuts
    this.cleanupKeyboardShortcuts?.();
    this.cleanupKeyboardShortcuts = attachKeyboardShortcuts(
      {
        onSelectAnswer: (index) => {
          if (this.currentAttemptView && !this.currentAttemptView.isAnswered) {
            this.handleAnswer(index);
          }
        },
        onNext: () => this.handleNext(),
        onPrevious: () => this.handlePrevious(),
        onFlag: () => this.handleFlag(),
        onSubmitAnswer: () => {
          if (this.currentAttemptView?.isAnswered) {
            if (this.currentAttemptView.canGoNext) {
              this.handleNext();
            } else {
              this.handleFinishRequest();
            }
          }
        },
      },
      () => this.attemptController.hasActiveSession(),
    );
  }

  /**
   * Clean up practice session state.
   * Called when finishing or aborting an attempt.
   */
  private cleanupPracticeSession(): void {
    this.practiceUiState = createPracticeSessionUiState();
    this._answeredIndicesCache = new Set();
    this.cleanupKeyboardShortcuts?.();
    this.cleanupKeyboardShortcuts = null;
  }

  // ============================================================================
  // Dashboard Navigation (Phase 15.1)
  // ============================================================================

  /** Currently active library tab */
  private activeLibraryTab: "library" | "insights" | "telemetry" = "library";

  /**
   * Switch the library screen to show a specific tab.
   * Library = normal exam list, Insights = InsightsView, Telemetry = TelemetryView
   */
  async showLibraryTab(tab: "library" | "insights" | "telemetry"): Promise<void> {
    this.activeLibraryTab = tab;
    this.updateTabButtons();

    // Persist selected tab (Phase 16)
    this.settingsService.setLastOpenedTab(tab as TabId).catch((e) =>
      console.warn("Failed to persist tab setting:", e),
    );

    const examListEl = document.getElementById("examList");
    const fileInputArea = document.querySelector(".file-input-area") as HTMLElement | null;
    const libraryHeader = document.getElementById("libraryHeaderBar");

    if (tab === "library") {
      // Show normal library elements
      if (fileInputArea) fileInputArea.style.display = "";
      if (libraryHeader) libraryHeader.style.display = "";
      await this.refreshLibrary();
    } else {
      // Hide library-specific elements
      if (fileInputArea) fileInputArea.style.display = "none";
      if (libraryHeader) libraryHeader.style.display = "none";

      if (examListEl) {
        // Show loading indicator (Phase 17)
        const loadingKey = tab === "insights" ? "loadingInsights" as const : "loadingTelemetry" as const;
        examListEl.innerHTML = "";
        examListEl.appendChild(createViewLoading(loadingKey, this.translations));

        try {
          let view: HTMLElement;
          if (tab === "insights") {
            view = await renderInsightsView(this.libraryController, undefined, this.translations);
          } else {
            view = await renderTelemetryView(this.libraryController, this.translations);
          }
          examListEl.innerHTML = "";
          examListEl.appendChild(view);
        } catch (e) {
          console.error(`Failed to load ${tab} view:`, e);
          // Show error state with Reload button (Phase 17)
          examListEl.innerHTML = "";
          examListEl.appendChild(
            createViewError(
              () => this.showLibraryTab(tab),
              this.translations,
            ),
          );
        }
      }
    }
  }

  private updateTabButtons(): void {
    const tabs = document.querySelectorAll(".library-tab-btn");
    tabs.forEach((btn) => {
      const tabId = (btn as HTMLElement).dataset.tab;
      btn.classList.toggle("active", tabId === this.activeLibraryTab);
    });
  }

  // ============================================================================
  // Legacy Compatibility (Preserved during migration)
  // ============================================================================

  showModeScreen(): void {
    // Legacy method - redirects to library during migration
    this.setView("library");
  }

  showFileScreen(): void {
    this.stopSimulacroTimer();
    this.cleanupPracticeSession();
    this.attemptController.abortAttempt();
    this.currentAttemptView = null;
    this.activeLibraryTab = "library";
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

  showOnboarding(): void {
    const onboarding = document.getElementById("onboardingOverlay");
    if (onboarding) {
      this.onboardingStep = 1;
      onboarding.classList.add("active");
      this.updateOnboardingStep();
    }
  }

  private hideOnboarding(): void {
    const onboarding = document.getElementById("onboardingOverlay");
    if (onboarding) {
      onboarding.classList.remove("active");
    }
    localStorage.setItem("ginaxams_onboarding_completed", "true");
  }

  private updateOnboardingStep(): void {
    // Show/hide step content
    const steps = document.querySelectorAll(".onboarding-step-content");
    steps.forEach((step) => {
      const stepNum = parseInt((step as HTMLElement).dataset.step || "0", 10);
      step.classList.toggle("hidden", stepNum !== this.onboardingStep);
    });

    // Update dot indicators
    const dots = document.querySelectorAll(
      ".onboarding-steps .onboarding-step",
    );
    dots.forEach((dot) => {
      const dotNum = parseInt((dot as HTMLElement).dataset.step || "0", 10);
      dot.classList.toggle("active", dotNum === this.onboardingStep);
    });

    // Update button visibility
    const prevBtn = document.getElementById("onboardingPrevBtn");
    const nextBtn = document.getElementById("onboardingNextBtn");
    const T = this.translations;

    if (prevBtn) {
      prevBtn.classList.toggle("hidden", this.onboardingStep <= 1);
    }

    if (nextBtn) {
      if (this.onboardingStep >= this.totalOnboardingSteps) {
        // On the last step, hide the Next button (user uses choice buttons)
        nextBtn.classList.add("hidden");
      } else {
        nextBtn.classList.remove("hidden");
        nextBtn.querySelector("span")!.textContent = T.onboardingNext || "Next";
      }
    }
  }

  skipOnboarding(): void {
    this.hideOnboarding();
  }

  nextOnboardingStep(): void {
    if (this.onboardingStep < this.totalOnboardingSteps) {
      this.onboardingStep++;
      this.updateOnboardingStep();
    }
  }

  prevOnboardingStep(): void {
    if (this.onboardingStep > 1) {
      this.onboardingStep--;
      this.updateOnboardingStep();
    }
  }

  finishOnboardingAndShowAIPrompt(): void {
    this.hideOnboarding();
    this.showAIPromptGenerator();
  }

  finishOnboardingAndShowTemplate(): void {
    this.hideOnboarding();
    this.showTemplateModal();
  }

  // ============================================================================
  // Language
  // ============================================================================

  private setLanguage(lang: LanguageCode): void {
    this._currentLang = lang;
    this.translations = getTranslations(lang);
    localStorage.setItem("ginaxams_lang", lang);

    // Persist to IndexedDB settings (Phase 16)
    this.settingsService.setLanguage(lang).catch((e) =>
      console.warn("Failed to persist language setting:", e),
    );

    // Update active button states
    const langEn = document.getElementById("langEn");
    const langEs = document.getElementById("langEs");
    langEn?.classList.toggle("active", lang === "en");
    langEs?.classList.toggle("active", lang === "es");

    this.updatePageText();

    // Recreate the attemptConfigScreen so it picks up the new language
    const existingConfig = document.getElementById("attemptConfigScreen");
    if (existingConfig) {
      existingConfig.remove();
    }
  }

  private updatePageText(): void {
    const T = this.translations;

    // Helper to safely set text content by element ID
    const setText = (id: string, text: string | undefined): void => {
      const el = document.getElementById(id);
      if (el && text !== undefined) el.textContent = text;
    };

    // Helper to safely set innerHTML by element ID
    const setHtml = (id: string, html: string | undefined): void => {
      const el = document.getElementById(id);
      if (el && html !== undefined) el.innerHTML = html;
    };

    // Header
    setText("appTitle", T.appTitle);

    // Version footer (Phase 17)
    setText(
      "versionFooter",
      (T.appVersionLabel ?? "GinaXams Player v{version}").replace(
        "{version}",
        APP_VERSION,
      ),
    );

    // Library screen
    setText("txtLoadExamFile", T.loadExamFile);
    setText("txtClickToSelect", T.clickToSelect);
    setText("txtAvailableExams", T.availableExams);
    setText("txtRefresh", T.refresh);
    setText("txtNewFolder", T.newFolder);
    setText("txtBackup", T.export);
    setText("txtRestore", T.import);

    // Set backup/restore button tooltips
    const btnBackup = document.getElementById("btnBackup");
    if (btnBackup) btnBackup.title = T.backupDescription ?? "";
    const btnRestore = document.getElementById("btnRestore");
    if (btnRestore) btnRestore.title = T.restoreDescription ?? "";

    // Navigation Tabs
    setText("txtTabLibrary", T.tabLibrary);
    setText("txtTabInsights", T.tabInsights);
    setText("txtTabTelemetry", T.tabTelemetry);

    // Options screen (mode selection)
    setText("txtOptions", T.options);
    setText("txtShuffleQuestions", T.shuffleQuestions);
    setText("txtShuffleAnswers", T.shuffleAnswers);
    setText("txtShowFeedback", T.showFeedback);
    setText("btnPracticeMode", T.practiceMode);
    setText("txtBackToMenu", `← ${T.backToLibrary || T.back}`);

    // Practice screen
    setText("txtExitReview", T.menu);
    setText("txtPrevious", T.previous);
    setText("txtNext", T.next);
    setText("txtFinish", T.finish);

    // Results screen
    setText("txtResults", T.results);
    setText("txtScoreSummary", T.scoreSummary);
    setText("txtResultCorrectLabel", T.correct);
    setText("txtResultWrongLabel", T.wrong);
    setText("txtResultBlankLabel", T.blank);
    setText("txtResultScoreLabel", T.score);
    setText("txtStatistics", T.statistics);
    setText("txtTotalQuestions", T.totalQuestions);
    setText("txtTimeSpent", T.timeSpent);
    setText("txtLastScore", T.lastScore);
    setText("txtBestScore", T.bestScore);
    setText("lblTryAgain", T.tryAgain);
    setText("lblReviewAnswers", T.reviewAnswers);
    setText("txtReviewSummaryTitle", T.reviewSummary);
    setText("txtBackToLibraryBtn", T.backToLibrary);

    // Review screen
    setText("txtBackReview", T.reviewBack || T.back);
    setText("txtFilterAll", T.filterAll);
    setText("txtFilterWrong", T.filterWrong);
    setText("txtCorrectAnswer", T.correctAnswer);
    setText("txtReviewPrevious", T.reviewPrev);
    setText("txtReviewNext", T.reviewNext);

    // Onboarding
    setText("txtOnboardingSkip", T.onboardingSkip);
    setText("txtOnboardingBack", T.onboardingBack);
    setText("txtOnboardingNext", T.onboardingNext);
    setText("txtOnboardingWelcomeTitle", T.onboardingWelcomeTitle);
    setText("txtOnboardingWelcomeText", T.onboardingWelcomeText);
    setText("txtOnboardingStorageTitle", T.onboardingStorageTitle);
    setText("txtOnboardingStorageText", T.onboardingStorageText);
    setText("txtOnboardingImportTitle", T.onboardingImportTitle);
    setText("txtOnboardingImportText", T.onboardingImportText);
    setText("txtOnboardingPracticeTitle", T.onboardingPracticeTitle);
    setText("txtOnboardingPracticeText", T.onboardingPracticeText);
    setText("txtOnboardingCreateTitle", T.onboardingCreateTitle);
    setText("txtOnboardingCreateText", T.onboardingCreateText);
    setText("txtOnboardingEasyTitle", T.onboardingEasyTitle);
    setText("txtOnboardingEasyDesc", T.onboardingEasyDesc);
    setText("txtOnboardingAdvancedTitle", T.onboardingAdvancedTitle);
    setText("txtOnboardingAdvancedDesc", T.onboardingAdvancedDesc);

    // Help
    setText("txtShowOnboarding", T.showOnboarding);
    setText("txtExamFormat", T.examFormat);
    setText("txtExamFormatBtn", T.createExamBtn || T.examFormat);

    // Template modal
    setText("txtExamFormatDesc", T.examFormatDesc);
    setText("txtUseWithAI", `💡 ${T.useWithAI}`);
    setText("txtAIHelpText", T.aiHelpText);
    setText("txtCopyTemplate", T.copyTemplate);
    setText("txtCopyInstead", T.copyInstead);
    setText("txtDownloadTemplate", `📥 ${T.downloadTemplate}`);

    // Choice modal
    setText("txtHowToCreate", T.howToCreate);
    setText("txtEasyWay", T.easyWay);
    setText("txtEasyWayDesc", T.easyWayDesc);
    setText("txtAdvancedWay", T.advancedWay);
    setText("txtAdvancedWayDesc", T.advancedWayDesc);

    // External link modal
    setText("txtLeavingSite", T.leavingSite);
    setText("txtExternalLinkConfirm", T.externalLinkConfirm);
    setText("txtStayHere", T.stayHere);
    setText("txtContinue", T.continue);

    // AI Prompt Generator
    setText("txtAIPromptTitle", T.aiPromptTitle);
    setText("txtAIPromptSubtitle", T.aiPromptSubtitle);
    setText("txtNumQuestionsLabel", T.numQuestionsLabel);
    setText("txtNumAnswersLabel", T.numAnswersLabel);
    setText("txtDifficultyLabel", T.difficultyLabel);
    setText("txtDifficultyEasy", T.difficultyEasy);
    setText("txtDifficultyMedium", T.difficultyMedium);
    setText("txtDifficultyHard", T.difficultyHard);
    setText("txtDifficultyMixed", T.difficultyMixed);
    setText("txtMaterialLabel", T.materialLabel);
    setText("txtGeneratePromptBtn", T.generatePromptBtn);
    setText("txtYourPrompt", T.yourPrompt);
    setText("txtCopyGeneratedPrompt", T.copyGeneratedPrompt);
    setText("txtNowPaste", T.nowPaste);
    setHtml("txtMaterialInChatLabel", T.materialInChatLabel);
    setHtml("txtKimiSuggestion", T.kimiSuggestion);

    // Exam name & JSON paste
    setText("txtAiExamNameLabel", T.aiPromptExamName);
    setText("txtAttachSources", T.aiPromptAttachSources);
    setText("txtAiHaveResponse", T.aiHaveResponse);
    setText("txtAiOrDivider", T.aiOrDivider);
    setText("txtAiValidateBtn", T.aiValidateBtn);
    setText("txtAiImportBtn", T.aiImportBtn);
    setText("txtAiPreviewTitle", T.aiPreviewTitle);
    setText("txtAiPreviewQuestions", T.aiPreviewQuestions);
    setText("txtAiPreviewCategories", T.aiPreviewCategories);

    // Exam name input placeholder
    const aiExamName = document.getElementById("aiExamName") as HTMLInputElement | null;
    if (aiExamName) {
      aiExamName.placeholder = T.aiPromptExamNamePlaceholder || "";
    }

    // JSON paste textarea placeholder
    const aiJsonPasteInput = document.getElementById("aiJsonPasteInput") as HTMLTextAreaElement | null;
    if (aiJsonPasteInput) {
      aiJsonPasteInput.placeholder = T.aiPastePlaceholder || "";
    }

    // Set textarea placeholder via data attribute
    const aiMaterial = document.getElementById(
      "aiMaterial",
    ) as HTMLTextAreaElement | null;
    if (aiMaterial) {
      aiMaterial.placeholder = T.materialPlaceholder || "";
    }

    // Re-render the library to pick up new translations
    if (this.libraryState) {
      this.renderLibrary();
    }
  }

  // ============================================================================
  // Version Footer (Phase 17)
  // ============================================================================

  /**
   * Render a small version footer at the bottom of the page.
   * Creates the element once; subsequent calls are no-ops (text updated via updatePageText).
   */
  private renderVersionFooter(): void {
    if (document.getElementById("versionFooter")) return;

    const footer = document.createElement("footer");
    footer.id = "versionFooter";
    footer.style.textAlign = "center";
    footer.style.padding = "12px 0";
    footer.style.fontSize = "0.75rem";
    footer.style.color = "var(--text-secondary, #666)";
    footer.style.opacity = "0.6";

    const versionText = document.createElement("span");
    versionText.textContent = (
      this.translations.appVersionLabel ?? "GinaXams Player v{version}"
    ).replace("{version}", APP_VERSION);

    const separator = document.createTextNode(" · ");

    const clearBtn = document.createElement("button");
    clearBtn.textContent = this.translations.clearData ?? "Clear All Data";
    clearBtn.style.cssText =
      "background:none; border:none; color:inherit; font-size:inherit; cursor:pointer; text-decoration:underline; opacity:0.8; padding:0;";
    clearBtn.addEventListener("click", () => this.clearAllData());

    footer.appendChild(versionText);
    footer.appendChild(separator);
    footer.appendChild(clearBtn);

    const container = document.querySelector(".container");
    if (container) {
      container.appendChild(footer);
    }
  }

  private async clearAllData(): Promise<void> {
    const msg =
      this.translations.confirmClearData ??
      "This will delete ALL exams, folders and progress. This cannot be undone. Are you sure?";
    if (!confirm(msg)) return;

    try {
      await this.libraryController.clearAllData();
      window.location.reload();
    } catch (e) {
      console.error("Failed to clear data:", e);
      alert("Failed to clear data. Please try again.");
    }
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
            <button class="icon-btn" onclick="event.stopPropagation(); window.app.showExamExportMenu('${exam.id}', event)" title="${T.exportExam}">📤</button>
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

    // Language selector buttons
    const langEn = document.getElementById("langEn");
    const langEs = document.getElementById("langEs");

    langEn?.addEventListener("click", () => {
      this.setLanguage("en");
    });
    langEs?.addEventListener("click", () => {
      this.setLanguage("es");
    });

    // Exam name availability check (debounced)
    const aiExamName = document.getElementById("aiExamName");
    aiExamName?.addEventListener("input", () => {
      this.checkExamNameAvailability();
    });

    // Click-outside-to-close for modals
    this.bindOverlayClose();
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
      if (e instanceof DuplicateExamError) {
        const msg = (this.translations.confirmOverwriteExam || 'An exam with ID "{examId}" already exists ("{title}"). Do you want to overwrite it?')
          .replace("{examId}", e.examId)
          .replace("{title}", e.existingTitle);
        if (confirm(msg)) {
          try {
            const text = await file.text();
            const data = JSON.parse(text);
            const examId = await this.libraryController.importExam(data, "uncategorized", true);
            await this.refreshLibrary();
            const imported = this.libraryState?.exams.find((ex) => ex.id === examId);
            const title = imported?.title ?? "Exam";
            alert(`${this.translations.importSuccessful || "Import successful"}: ${title}`);
          } catch (e2) {
            console.error("Import failed:", e2);
            const message = e2 instanceof Error ? e2.message : "Unknown error";
            alert(`${this.translations.importFailed}: ${message}`);
          }
        }
        return;
      }
      console.error("Import failed:", e);
      const message = e instanceof Error ? e.message : "Unknown error";
      alert(`${this.translations.importFailed}: ${message}`);
    }
  }

  async exportLibrary(): Promise<void> {
    try {
      const snapshot = await this.libraryController.createBackup();
      const filename = `ginaxams_backup_${new Date().toISOString().split("T")[0]}.json`;
      downloadAsJson(snapshot, filename);
      alert(this.translations.backupCreated ?? "Backup downloaded!");
    } catch (e) {
      console.error("Export failed:", e);
      alert(this.translations.exportFailed);
    }
  }

  async restoreLibrary(): Promise<void> {
    const T = this.translations;

    // Confirm destructive action
    if (!confirm(T.restoreWarning ?? "This will replace ALL your data. Continue?")) {
      return;
    }

    // Open file picker
    const restoreInput = document.getElementById("restoreFileInput") as HTMLInputElement | null;
    if (!restoreInput) return;

    // Reset value so the same file can be selected again
    restoreInput.value = "";

    // Use a one-shot change handler
    const handleFile = async (e: Event): Promise<void> => {
      restoreInput.removeEventListener("change", handleFile);
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) return;

      try {
        const text = await files[0].text();
        const data = JSON.parse(text);
        await this.libraryController.restoreBackup(data);
        await this.refreshLibrary();
        alert(T.restoreSuccess ?? "Backup restored successfully!");
      } catch (err) {
        console.error("Restore failed:", err);
        const msg = err instanceof Error ? err.message : "Unknown error";
        alert(`${T.restoreFailed ?? "Restore failed"}: ${msg}`);
      }
    };

    restoreInput.addEventListener("change", handleFile);
    restoreInput.click();
  }

  // ============================================================================
  // Per-Exam Export
  // ============================================================================

  async showExamExportMenu(examId: string, event: MouseEvent): Promise<void> {
    event.stopPropagation();
    const T = this.translations;

    // Remove any existing menu
    document.getElementById("examExportMenu")?.remove();

    // Get exam data
    let examData;
    let examTitle: string;
    try {
      examData = await this.libraryController.exportExamJson(examId);
      examTitle = examData.title;
    } catch {
      alert(T.exportFailed ?? "Export failed");
      return;
    }

    // Create popup menu
    const menu = document.createElement("div");
    menu.id = "examExportMenu";
    menu.className = "exam-export-menu";
    menu.innerHTML = `
      <button class="exam-export-option" data-action="download">
        <span>⬇️</span> ${T.downloadJson ?? "Download JSON"}
      </button>
      <button class="exam-export-option" data-action="copy">
        <span>📋</span> ${T.copyJson ?? "Copy JSON"}
      </button>
      ${canShareFiles() ? `
        <button class="exam-export-option" data-action="share">
          <span>🔗</span> ${T.shareExam ?? "Share"}
        </button>
      ` : ""}
    `;

    // Position near the button
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    menu.style.position = "fixed";
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.right = `${window.innerWidth - rect.right}px`;
    menu.style.zIndex = "1000";

    // Handle actions
    menu.addEventListener("click", async (e) => {
      const btn = (e.target as HTMLElement).closest("[data-action]") as HTMLElement | null;
      if (!btn) return;

      const action = btn.dataset.action;
      menu.remove();

      if (action === "download") {
        const filename = `${examTitle.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;
        downloadAsJson(examData, filename);
        alert(T.exportExamSuccess ?? "Exam exported!");
      } else if (action === "copy") {
        const ok = await copyJsonToClipboard(examData);
        alert(ok ? (T.copiedToClipboard ?? "Copied to clipboard!") : (T.exportFailed ?? "Export failed"));
      } else if (action === "share") {
        const filename = `${examTitle.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;
        const ok = await shareJson(examData, examTitle, filename);
        if (!ok) alert(T.shareNotSupported ?? "Sharing not supported on this device");
      }
    });

    document.body.appendChild(menu);

    // Close menu on click outside
    const closeMenu = (e: MouseEvent): void => {
      if (!menu.contains(e.target as Node)) {
        menu.remove();
        document.removeEventListener("click", closeMenu);
      }
    };
    // Delay to avoid immediate close from the current click
    setTimeout(() => document.addEventListener("click", closeMenu), 0);
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
  // Auto-Load Example Exam (Phase 15.1)
  // ============================================================================

  /**
   * Automatically load the example exam when the database is empty.
   * Only runs once per empty database — does not overwrite existing exams.
   */
  private async autoLoadExampleExam(): Promise<void> {
    if (!this.libraryState) return;

    const hasExams = this.libraryState.exams.length > 0;
    if (hasExams) return;

    try {
      await this.importDemoData();
    } catch (e) {
      console.error("Failed to auto-load example exam:", e);
    }
  }

  // ============================================================================
  // Demo Data
  // ============================================================================

  async importDemoData(): Promise<void> {
    const demoExam = {
      schema_version: "2.0" as const,
      exam_id: "sample-basic-arithmetic",
      title: "Sample Exam: Basic Arithmetic",
      categorias: ["Arithmetic"],
      total_questions: 5,
      questions: [
        {
          number: 1,
          text: "What is 2 + 2?",
          categoria: ["Arithmetic"],
          articulo_referencia: "Basic Addition Rules",
          feedback: {
            cita_literal: "The sum of two and two equals four. Addition is the process of combining two or more numbers to obtain a total.",
            explicacion_fallo: "2 + 2 = 4. The number 3 is too low (that would be 1 + 2), 5 is too high (that would be 2 + 3), and 6 is the result of 2 + 4.",
          },
          answers: [
            { letter: "A", text: "3", isCorrect: false },
            { letter: "B", text: "4", isCorrect: true },
            { letter: "C", text: "5", isCorrect: false },
            { letter: "D", text: "6", isCorrect: false },
          ],
        },
        {
          number: 2,
          text: "What is 5 − 3?",
          categoria: ["Arithmetic"],
          articulo_referencia: "Basic Subtraction Rules",
          feedback: {
            cita_literal: "Subtraction is the inverse of addition. When we subtract 3 from 5, we remove 3 units from 5, leaving 2.",
            explicacion_fallo: "5 − 3 = 2. The number 1 would be 4 − 3, the number 3 would be 6 − 3, and 8 would be 5 + 3 (addition, not subtraction).",
          },
          answers: [
            { letter: "A", text: "1", isCorrect: false },
            { letter: "B", text: "2", isCorrect: true },
            { letter: "C", text: "3", isCorrect: false },
            { letter: "D", text: "8", isCorrect: false },
          ],
        },
        {
          number: 3,
          text: "What is 10 ÷ 2?",
          categoria: ["Arithmetic"],
          articulo_referencia: "Basic Division Rules",
          feedback: {
            cita_literal: "Division distributes a number into equal parts. Dividing 10 by 2 yields 5, meaning 10 can be split into two groups of 5.",
            explicacion_fallo: "10 ÷ 2 = 5. The number 2 would be 10 ÷ 5, the number 8 would be 10 − 2, and 20 would be 10 × 2 (multiplication, not division).",
          },
          answers: [
            { letter: "A", text: "2", isCorrect: false },
            { letter: "B", text: "5", isCorrect: true },
            { letter: "C", text: "8", isCorrect: false },
            { letter: "D", text: "20", isCorrect: false },
          ],
        },
        {
          number: 4,
          text: "What is 3 × 3?",
          categoria: ["Arithmetic"],
          articulo_referencia: "Basic Multiplication Rules",
          feedback: {
            cita_literal: "Multiplication is repeated addition. 3 × 3 means adding 3 three times: 3 + 3 + 3 = 9.",
            explicacion_fallo: "3 × 3 = 9. The number 6 would be 3 × 2 or 3 + 3, the number 12 would be 3 × 4, and 27 would be 3 × 3 × 3 (3 cubed).",
          },
          answers: [
            { letter: "A", text: "6", isCorrect: false },
            { letter: "B", text: "9", isCorrect: true },
            { letter: "C", text: "12", isCorrect: false },
            { letter: "D", text: "27", isCorrect: false },
          ],
        },
        {
          number: 5,
          text: "What is 7 + 1?",
          categoria: ["Arithmetic"],
          articulo_referencia: "Basic Addition Rules",
          feedback: {
            cita_literal: "Adding 1 to any number gives the next consecutive number. 7 + 1 = 8.",
            explicacion_fallo: "7 + 1 = 8. The number 6 would be 7 − 1, the number 7 would be 7 + 0, and 9 would be 7 + 2.",
          },
          answers: [
            { letter: "A", text: "6", isCorrect: false },
            { letter: "B", text: "7", isCorrect: false },
            { letter: "C", text: "8", isCorrect: true },
            { letter: "D", text: "9", isCorrect: false },
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
  // Help Menu
  // ============================================================================

  toggleHelpMenu(): void {
    const menu = document.getElementById("helpMenuPopup");
    const btn = document.getElementById("helpToggleBtn");
    if (menu) {
      menu.classList.toggle("hidden");
      btn?.classList.toggle("active");
    }
  }

  // ============================================================================
  // Template Modal
  // ============================================================================

  showTemplateModal(): void {
    const modal = document.getElementById("templateModal");
    if (modal) {
      modal.classList.remove("hidden");
      modal.classList.add("active");
      this.loadTemplateCode();
    }
  }

  closeTemplateModal(): void {
    const modal = document.getElementById("templateModal");
    if (modal) {
      modal.classList.remove("active");
      modal.classList.add("hidden");
    }
  }

  private loadTemplateCode(): void {
    const code = document.getElementById("templateCode");
    if (!code) return;

    const template = {
      schema_version: "2.0",
      exam_id: "my-exam-1",
      title: "My Exam Title",
      categorias: ["Category1", "Category2"],
      total_questions: 1,
      questions: [
        {
          number: 1,
          text: "Question text here?",
          categoria: ["Category1"],
          articulo_referencia: "Art. 1",
          feedback: {
            cita_literal: "The literal citation from source",
            explicacion_fallo: "Explanation of why the wrong answer is wrong",
          },
          answers: [
            { letter: "A", text: "Correct answer", isCorrect: true },
            { letter: "B", text: "Wrong answer 1", isCorrect: false },
            { letter: "C", text: "Wrong answer 2", isCorrect: false },
            { letter: "D", text: "Wrong answer 3", isCorrect: false },
          ],
        },
      ],
    };

    code.textContent = JSON.stringify(template, null, 2);
  }

  async copyTemplate(): Promise<void> {
    const code = document.getElementById("templateCode");
    if (!code) return;

    try {
      await navigator.clipboard.writeText(code.textContent || "");
      alert(this.translations.copied || "Copied to clipboard!");
    } catch {
      // Fallback
      const textarea = document.createElement("textarea");
      textarea.value = code.textContent || "";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      alert(this.translations.copied || "Copied to clipboard!");
    }
  }

  downloadTemplate(): void {
    const code = document.getElementById("templateCode");
    if (!code) return;

    try {
      const templateData = JSON.parse(code.textContent || "{}");
      downloadAsJson(templateData, "exam_template.json");
    } catch {
      // Fallback for non-JSON content
      const blob = new Blob([code.textContent || ""], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "exam_template.json";
      a.click();
      URL.revokeObjectURL(url);
    }
    alert(this.translations.templateDownloaded || "Template downloaded!");
  }

  // ============================================================================
  // Choice Modal
  // ============================================================================

  showChoiceModal(): void {
    const modal = document.getElementById("choiceModal");
    if (modal) {
      modal.classList.remove("hidden");
      modal.classList.add("active");
    }
  }

  closeChoiceModal(): void {
    const modal = document.getElementById("choiceModal");
    if (modal) {
      modal.classList.remove("active");
      modal.classList.add("hidden");
    }
  }

  // ============================================================================
  // AI Prompt Generator
  // ============================================================================

  showAIPromptGenerator(): void {
    const modal = document.getElementById("aiPromptModal");
    if (modal) {
      modal.classList.remove("hidden");
      modal.classList.add("active");
      // Reset form
      const result = document.getElementById("aiPromptResult");
      if (result) result.classList.add("hidden");
      const destinations = document.getElementById("aiDestinations");
      if (destinations) destinations.classList.add("hidden");
      // Reset JSON paste section
      const pasteSection = document.getElementById("aiJsonPasteSection");
      if (pasteSection) pasteSection.classList.add("hidden");
      const importBtn = document.getElementById("aiJsonImportBtn");
      if (importBtn) importBtn.classList.add("hidden");
      const preview = document.getElementById("aiJsonPreview");
      if (preview) preview.classList.add("hidden");
      const pasteStatus = document.getElementById("aiJsonPasteStatus");
      if (pasteStatus) pasteStatus.classList.add("hidden");
      const pasteInput = document.getElementById("aiJsonPasteInput") as HTMLTextAreaElement | null;
      if (pasteInput) pasteInput.value = "";
      // Reset exam name status
      const nameStatus = document.getElementById("aiExamNameStatus");
      if (nameStatus) { nameStatus.classList.add("hidden"); nameStatus.className = "ai-exam-name-status hidden"; }
    }
  }

  closeAIPromptGenerator(): void {
    const modal = document.getElementById("aiPromptModal");
    if (modal) {
      modal.classList.remove("active");
      modal.classList.add("hidden");
    }
  }

  generateAIPrompt(): void {
    const T = this.translations;
    const examName =
      (document.getElementById("aiExamName") as HTMLInputElement)?.value?.trim() || "";
    const numQuestions =
      (document.getElementById("aiNumQuestions") as HTMLInputElement)?.value ||
      "10";
    const numAnswers =
      (document.getElementById("aiNumAnswers") as HTMLInputElement)?.value ||
      "4";
    const difficulty =
      (document.getElementById("aiDifficulty") as HTMLSelectElement)?.value ||
      "medium";

    if (!examName) {
      alert(T.aiPromptExamNameRequired || "Please enter an exam name.");
      return;
    }

    const difficultyText: Record<string, string> = {
      easy: T.difficultyEasy || "Easy",
      medium: T.difficultyMedium || "Medium",
      hard: T.difficultyHard || "Hard",
      mixed: T.difficultyMixed || "Mixed",
    };

    // Build answer letters: A, B, C, D, ...
    const numAns = parseInt(numAnswers, 10) || 4;
    const letters = Array.from({ length: numAns }, (_, i) =>
      String.fromCharCode(65 + i),
    );
    const lettersStr = letters.join(", ");

    // Build prompt body from translations
    const body = (T.aiPromptBody || "")
      .replace("{numQuestions}", numQuestions)
      .replace("{numAnswers}", numAnswers)
      .replace("{letters}", lettersStr);

    const diffLabel = difficultyText[difficulty] || difficulty;
    const lang = T.aiPromptLanguage || "English";

    // Build the example answer entries
    const exampleAnswers = letters
      .map(
        (l, i) =>
          `        {"letter": "${l}", "text": "[${lang === "español" ? "Texto de respuesta" : "Answer text"}]", "isCorrect": ${i === 0}}`,
      )
      .join(",\n");

    // Use the exam name as both exam_id and title
    const safeExamId = examName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    const schemaNote = T.aiPromptSchemaNote || "Please generate a JSON object in this exact format:";
    const rules = (T.aiPromptRules || "").replace("{difficulty}", diffLabel);

    let prompt = `${body}

NIVEL DE DIFICULTAD / DIFFICULTY: ${diffLabel}
IDIOMA / LANGUAGE: ${lang}

${schemaNote}

{
  "schema_version": "2.0",
  "exam_id": "${safeExamId}",
  "title": "${examName}",
  "categorias": ["${lang === "español" ? "Categoría1" : "Category1"}", "${lang === "español" ? "Categoría2" : "Category2"}"],
  "total_questions": ${numQuestions},
  "questions": [
    {
      "number": 1,
      "text": "[${lang === "español" ? "Texto de la pregunta aquí" : "Question text here"}]",
      "categoria": ["${lang === "español" ? "Categoría1" : "Category1"}"],
      "articulo_referencia": "${lang === "español" ? "Artículo de referencia" : "Reference article"}",
      "feedback": {
        "cita_literal": "${lang === "español" ? "Cita literal de la fuente" : "Literal citation from source"}",
        "explicacion_fallo": "${lang === "español" ? "Explicación de por qué las respuestas incorrectas son erróneas" : "Explanation of why wrong answers are wrong"}"
      },
      "answers": [
${exampleAnswers}
      ]
    }
  ]
}

IMPORTANT: Use "${safeExamId}" as the "exam_id" and "${examName}" as the "title". Do NOT change these values.
IMPORTANT: The "categorias" array at the exam level MUST list EVERY category that appears in any question's "categoria" field. Every question "categoria" value MUST exist in the top-level "categorias" array.

${rules}`;

    const output = document.getElementById(
      "aiGeneratedPrompt",
    ) as HTMLTextAreaElement;
    if (output) output.value = prompt;

    const result = document.getElementById("aiPromptResult");
    if (result) result.classList.remove("hidden");
  }

  async copyGeneratedPrompt(): Promise<void> {
    const output = document.getElementById(
      "aiGeneratedPrompt",
    ) as HTMLTextAreaElement;
    if (!output) return;

    try {
      await navigator.clipboard.writeText(output.value);
    } catch {
      output.select();
      document.execCommand("copy");
    }

    // Show AI destinations
    const destinations = document.getElementById("aiDestinations");
    if (destinations) destinations.classList.remove("hidden");
  }

  // ============================================================================
  // Exam Name Duplicate Check
  // ============================================================================

  private examNameCheckTimeout: ReturnType<typeof setTimeout> | null = null;

  checkExamNameAvailability(): void {
    if (this.examNameCheckTimeout) {
      clearTimeout(this.examNameCheckTimeout);
    }
    this.examNameCheckTimeout = setTimeout(() => {
      this.doCheckExamName();
    }, 300);
  }

  private async doCheckExamName(): Promise<void> {
    const T = this.translations;
    const nameInput = document.getElementById("aiExamName") as HTMLInputElement | null;
    const statusEl = document.getElementById("aiExamNameStatus");
    if (!nameInput || !statusEl) return;

    const name = nameInput.value.trim();
    if (!name) {
      statusEl.classList.add("hidden");
      statusEl.className = "ai-exam-name-status hidden";
      return;
    }

    try {
      const exams = await this.libraryController.getExams();
      const safeId = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const duplicate = exams.find(
        (e) => e.data.exam_id === safeId || e.data.exam_id === name,
      );
      if (duplicate) {
        statusEl.textContent = T.aiPromptExamNameDuplicate || "An exam with this name already exists. It will be overwritten if you import.";
        statusEl.className = "ai-exam-name-status warning";
      } else {
        statusEl.classList.add("hidden");
        statusEl.className = "ai-exam-name-status hidden";
      }
    } catch {
      // Silently ignore check failures
    }
  }

  // ============================================================================
  // JSON Paste, Validate & Import
  // ============================================================================

  toggleJsonPasteSection(): void {
    const section = document.getElementById("aiJsonPasteSection");
    if (section) {
      section.classList.toggle("hidden");
    }
  }

  async pasteFromClipboard(): Promise<void> {
    try {
      const text = await navigator.clipboard.readText();
      const input = document.getElementById("aiJsonPasteInput") as HTMLTextAreaElement | null;
      if (input) {
        input.value = text;
        input.focus();
      }
    } catch {
      // Clipboard access denied or unavailable — ignore silently
    }
  }

  private lastValidatedExamJson: unknown = null;

  validatePastedJson(): void {
    const T = this.translations;
    const input = document.getElementById("aiJsonPasteInput") as HTMLTextAreaElement | null;
    const statusEl = document.getElementById("aiJsonPasteStatus");
    const previewEl = document.getElementById("aiJsonPreview");
    const importBtn = document.getElementById("aiJsonImportBtn");

    if (!input || !statusEl || !previewEl || !importBtn) return;

    const raw = input.value.trim();
    if (!raw) return;

    // Step 1: Parse JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      statusEl.textContent = T.aiJsonInvalidJson || "Invalid JSON: could not parse the text.";
      statusEl.className = "ai-json-paste-status error";
      previewEl.classList.add("hidden");
      importBtn.classList.add("hidden");
      this.lastValidatedExamJson = null;
      return;
    }

    // Step 2: Validate exam schema via library controller
    try {
      const validated = this.libraryController.validateExamJson(parsed);

      // Success - show preview
      this.lastValidatedExamJson = parsed;
      statusEl.textContent = `✅ ${T.aiJsonValid || "Valid exam JSON!"}`;
      statusEl.className = "ai-json-paste-status success";

      // Fill preview
      const titleVal = document.getElementById("aiPreviewTitleValue");
      const questionsVal = document.getElementById("aiPreviewQuestionsValue");
      const categoriesVal = document.getElementById("aiPreviewCategoriesValue");
      if (titleVal) titleVal.textContent = validated.title;
      if (questionsVal) questionsVal.textContent = String(validated.questions.length);
      if (categoriesVal) categoriesVal.textContent = validated.categorias.join(", ");

      previewEl.classList.remove("hidden");
      importBtn.classList.remove("hidden");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown validation error";
      statusEl.textContent = `${T.aiJsonInvalidSchema || "Invalid exam format"}: ${message}`;
      statusEl.className = "ai-json-paste-status error";
      previewEl.classList.add("hidden");
      importBtn.classList.add("hidden");
      this.lastValidatedExamJson = null;
    }
  }

  async importPastedJson(): Promise<void> {
    const T = this.translations;
    if (!this.lastValidatedExamJson) return;

    try {
      const examId = await this.libraryController.importExam(this.lastValidatedExamJson);
      await this.refreshLibrary();

      const imported = this.libraryState?.exams.find((e) => e.id === examId);
      const title = imported?.title ?? "Exam";
      alert(`${T.aiImportSuccess || "Exam imported successfully!"}: ${title}`);

      // Close the AI prompt modal
      this.closeAIPromptGenerator();
      this.lastValidatedExamJson = null;
    } catch (e) {
      if (e instanceof DuplicateExamError) {
        const msg = (T.confirmOverwriteExam || 'An exam with ID "{examId}" already exists ("{title}"). Do you want to overwrite it?')
          .replace("{examId}", e.examId)
          .replace("{title}", e.existingTitle);
        if (confirm(msg)) {
          try {
            const examId = await this.libraryController.importExam(this.lastValidatedExamJson!, "uncategorized", true);
            await this.refreshLibrary();
            const imported = this.libraryState?.exams.find((ex) => ex.id === examId);
            const title = imported?.title ?? "Exam";
            alert(`${T.aiImportSuccess || "Exam imported successfully!"}: ${title}`);
            this.closeAIPromptGenerator();
            this.lastValidatedExamJson = null;
          } catch (e2) {
            console.error("Import failed:", e2);
            const message = e2 instanceof Error ? e2.message : "Unknown error";
            alert(`${T.importFailed || "Import failed"}: ${message}`);
          }
        }
        return;
      }
      console.error("Import failed:", e);
      const message = e instanceof Error ? e.message : "Unknown error";
      alert(`${T.importFailed || "Import failed"}: ${message}`);
    }
  }

  // ============================================================================
  // Click-outside-to-close for modals
  // ============================================================================

  private bindOverlayClose(): void {
    const overlays: Array<{ id: string; closeFn: () => void }> = [
      { id: "aiPromptModal", closeFn: () => this.closeAIPromptGenerator() },
      { id: "templateModal", closeFn: () => this.closeTemplateModal() },
      { id: "choiceModal", closeFn: () => this.closeChoiceModal() },
      { id: "externalLinkModal", closeFn: () => this.closeExternalLinkModal() },
    ];

    for (const { id, closeFn } of overlays) {
      const overlay = document.getElementById(id);
      overlay?.addEventListener("click", (e) => {
        if (e.target === overlay) {
          closeFn();
        }
      });
    }

    // Also close help menu when clicking outside
    document.addEventListener("click", (e) => {
      const helpMenu = document.getElementById("helpMenuPopup");
      const helpBtn = document.getElementById("helpToggleBtn");
      if (helpMenu && !helpMenu.classList.contains("hidden") &&
          !helpMenu.contains(e.target as Node) &&
          !helpBtn?.contains(e.target as Node)) {
        helpMenu.classList.add("hidden");
      }
    });
  }

  // ============================================================================
  // External Link Confirmation
  // ============================================================================

  openExternalLink(url: string, name: string): void {
    this.pendingExternalUrl = url;
    this.pendingExternalName = name;

    const modal = document.getElementById("externalLinkModal");
    const urlDisplay = document.getElementById("externalLinkUrl");
    const titleDisplay = document.getElementById("txtLeavingSite");
    if (modal) modal.classList.remove("hidden");
    if (urlDisplay) urlDisplay.textContent = url;
    if (titleDisplay) {
      titleDisplay.textContent = `${this.translations.leavingSite || "You're about to leave GinaXams Player"} → ${this.pendingExternalName}`;
    }
  }

  closeExternalLinkModal(): void {
    const modal = document.getElementById("externalLinkModal");
    if (modal) modal.classList.add("hidden");
    this.pendingExternalUrl = "";
    this.pendingExternalName = "";
  }

  confirmExternalLink(): void {
    if (this.pendingExternalUrl) {
      window.open(this.pendingExternalUrl, "_blank");
    }
    this.closeExternalLinkModal();
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
