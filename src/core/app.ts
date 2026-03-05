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

  // Onboarding state
  private onboardingStep = 1;
  private readonly totalOnboardingSteps = 5;

  // External link pending
  private pendingExternalUrl = "";
  private pendingExternalName = "";

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
      const isSimulacro = this.currentAttemptView?.mode === "simulacro" && this.currentAttemptView?.timer;
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
            : (T.notAttempted || "-");
        bestScoreEl.textContent =
          exam.stats.bestScore !== undefined
            ? `${exam.stats.bestScore}%`
            : (T.notAttempted || "-");
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
    if (txtBackReview) txtBackReview.textContent = T.reviewBack || T.back || "Back";
    const txtReviewPrev = document.getElementById("txtReviewPrevious");
    if (txtReviewPrev) txtReviewPrev.textContent = T.reviewPrev || "← Prev";
    const txtReviewNext = document.getElementById("txtReviewNext");
    if (txtReviewNext) txtReviewNext.textContent = T.reviewNext || "Next →";

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
      correctText.textContent = `${q.correctAnswerLetter}`;
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
    }
  }

  /**
   * Navigate to next question in review screen.
   */
  reviewNextQuestion(): void {
    if (this.reviewCurrentIndex < this.reviewFilteredQuestions.length - 1) {
      this.reviewCurrentIndex++;
      this.renderReviewQuestion();
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
      if (mode === "simulacro") {
        const timerSelect = document.getElementById("simulacroTimerSelect") as HTMLSelectElement | null;
        if (timerSelect) {
          timeLimitMs = parseInt(timerSelect.value, 10);
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
              }
            : undefined,
      });

      this.currentAttemptView = viewState;
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
        ? (T.hideTimer || "Hide Timer")
        : (T.showTimer || "Show Timer");
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
    this.stopSimulacroTimer();

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
  // Legacy Compatibility (Preserved during migration)
  // ============================================================================

  showModeScreen(): void {
    // Legacy method - redirects to library during migration
    this.setView("library");
  }

  showFileScreen(): void {
    this.stopSimulacroTimer();
    this.attemptController.abortAttempt();
    this.currentAttemptView = null;
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

    // Library screen
    setText("txtLoadExamFile", T.loadExamFile);
    setText("txtClickToSelect", T.clickToSelect);
    setText("txtAvailableExams", T.availableExams);
    setText("txtRefresh", T.refresh);

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

    // Language selector buttons
    const langEn = document.getElementById("langEn");
    const langEs = document.getElementById("langEs");

    langEn?.addEventListener("click", () => {
      this.setLanguage("en");
    });
    langEs?.addEventListener("click", () => {
      this.setLanguage("es");
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
      this.loadTemplateCode();
    }
  }

  closeTemplateModal(): void {
    const modal = document.getElementById("templateModal");
    if (modal) {
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

    const blob = new Blob([code.textContent || ""], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "exam_template.json";
    a.click();
    URL.revokeObjectURL(url);
    alert(this.translations.templateDownloaded || "Template downloaded!");
  }

  // ============================================================================
  // Choice Modal
  // ============================================================================

  showChoiceModal(): void {
    const modal = document.getElementById("choiceModal");
    if (modal) modal.classList.remove("hidden");
  }

  closeChoiceModal(): void {
    const modal = document.getElementById("choiceModal");
    if (modal) modal.classList.add("hidden");
  }

  // ============================================================================
  // AI Prompt Generator
  // ============================================================================

  showAIPromptGenerator(): void {
    const modal = document.getElementById("aiPromptModal");
    if (modal) {
      modal.classList.remove("hidden");
      // Reset form
      const result = document.getElementById("aiPromptResult");
      if (result) result.classList.add("hidden");
      const destinations = document.getElementById("aiDestinations");
      if (destinations) destinations.classList.add("hidden");
    }
  }

  closeAIPromptGenerator(): void {
    const modal = document.getElementById("aiPromptModal");
    if (modal) modal.classList.add("hidden");
  }

  toggleMaterialField(): void {
    const checkbox = document.getElementById(
      "aiMaterialInChat",
    ) as HTMLInputElement | null;
    const field = document.getElementById("aiMaterialField");
    if (field && checkbox) {
      field.style.display = checkbox.checked ? "none" : "block";
    }
  }

  generateAIPrompt(): void {
    const T = this.translations;
    const numQuestions =
      (document.getElementById("aiNumQuestions") as HTMLInputElement)?.value ||
      "10";
    const numAnswers =
      (document.getElementById("aiNumAnswers") as HTMLInputElement)?.value ||
      "4";
    const difficulty =
      (document.getElementById("aiDifficulty") as HTMLSelectElement)?.value ||
      "medium";
    const materialInChat = (
      document.getElementById("aiMaterialInChat") as HTMLInputElement
    )?.checked;
    const material =
      (document.getElementById("aiMaterial") as HTMLTextAreaElement)?.value ||
      "";

    if (!materialInChat && !material.trim()) {
      alert(T.aiPromptNoMaterial || "Please enter your study material first!");
      return;
    }

    const difficultyText: Record<string, string> = {
      easy: T.difficultyEasy || "Easy",
      medium: T.difficultyMedium || "Medium",
      hard: T.difficultyHard || "Hard",
      mixed: T.difficultyMixed || "Mixed",
    };

    let prompt = `Generate an exam in JSON format with exactly ${numQuestions} questions, each with ${numAnswers} answer options. Difficulty: ${difficultyText[difficulty] || difficulty}.

The JSON must follow this exact schema (schema_version "2.0"):

{
  "schema_version": "2.0",
  "exam_id": "unique-exam-id",
  "title": "Exam Title",
  "categorias": ["Category1", "Category2"],
  "total_questions": ${numQuestions},
  "questions": [
    {
      "number": 1,
      "text": "Question text?",
      "categoria": ["Category1"],
      "articulo_referencia": "Reference article",
      "feedback": {
        "cita_literal": "Literal citation from source",
        "explicacion_fallo": "Explanation of why wrong answers are wrong"
      },
      "answers": [
        { "letter": "A", "text": "Answer text", "isCorrect": true },
        { "letter": "B", "text": "Answer text", "isCorrect": false }
      ]
    }
  ]
}

Rules:
- Exactly one answer per question must have "isCorrect": true
- total_questions must equal the number of questions
- Each question must have exactly ${numAnswers} answers
- Output valid JSON only, no extra text`;

    if (!materialInChat && material.trim()) {
      prompt += `\n\nStudy material to create questions from:\n${material}`;
    } else if (materialInChat) {
      prompt += `\n\n[I will paste my study material in the next message]`;
    }

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
