/**
 * AttemptFlowController — Attempt lifecycle orchestration.
 *
 * Coordinates:
 * - Exam selection → mode config
 * - Attempt creation & execution
 * - Timer management
 * - Answer handling & navigation
 * - Finish flow → results → review
 *
 * Delegates rendering to view modules and PracticeManager.
 * No business logic — all scoring/telemetry stays in application layer.
 */

import type { AttemptController } from "../../application/attemptController.js";
import type {
  AttemptViewState,
  AttemptResultViewState,
  ExamCardView,
  PracticeSessionUiState,
  QuestionResultView,
} from "../../application/viewState.js";
import { createPracticeSessionUiState } from "../../application/viewState.js";
import type { PracticeManager } from "../../modes/practice.js";
import type { Translations } from "../../i18n/index.js";
import { computeNavigatorItems } from "../../ui/practice/buildQuestionNavigator.js";
import {
  computeSummaryData,
  renderSummaryModal,
} from "../../ui/practice/buildQuestionSummaryModal.js";
import { attachKeyboardShortcuts } from "../../ui/practice/buildKeyboardShortcuts.js";
import {
  findNextWrongIndex,
  findNextBlankIndex,
} from "../../ui/practice/buildQuestionNavigator.js";

// Views
import {
  createAttemptConfigScreen,
  showAttemptConfigScreen,
} from "../../ui/views/AttemptConfigView.js";
import {
  showExecutionScreen,
  renderTimer,
  updateTimerVisibility,
} from "../../ui/views/AttemptExecutionView.js";
import {
  showResultsScreen,
  bindResultsActions,
  renderScoreComparison,
} from "../../ui/views/ResultsView.js";
import {
  initReviewLabels,
  showReviewScreen,
  bindReviewFilters,
  renderReviewQuestion,
  renderEmptyReviewState,
  renderReviewNavigator,
  scrollQuestionIntoView,
  buildReviewNavItems,
} from "../../ui/views/ReviewView.js";

/**
 * Pending attempt configuration (UI-only state).
 */
interface PendingAttempt {
  examId: string;
  examTitle: string;
}

type AppView = "library" | "attemptConfig" | "attemptExecution" | "results";

export interface AttemptFlowDeps {
  attemptController: AttemptController;
  practiceManager: PracticeManager;
  getTranslations: () => Translations;
  getLibraryExam: (examId: string) => ExamCardView | undefined;
  refreshLibrary: () => Promise<void>;
  setView: (view: AppView) => void;
  hideAllScreens: () => void;
}

export class AttemptFlowController {
  private deps: AttemptFlowDeps;

  // Attempt state
  private pendingAttempt: PendingAttempt | null = null;
  private currentAttemptView: AttemptViewState | null = null;
  private currentResultView: AttemptResultViewState | null = null;

  // Timer state
  private simulacroTimerInterval: ReturnType<typeof setInterval> | null = null;
  private timerVisible = true;

  // Practice session UI state
  private practiceUiState: PracticeSessionUiState =
    createPracticeSessionUiState();
  private cleanupKeyboardShortcuts: (() => void) | null = null;
  private _answeredIndicesCache: Set<number> = new Set();

  // Review state
  private reviewCurrentIndex = 0;
  private reviewFilteredQuestions: QuestionResultView[] = [];

  constructor(deps: AttemptFlowDeps) {
    this.deps = deps;
  }

  // ==========================================================================
  // Exam Selection
  // ==========================================================================

  selectExam(examId: string): void {
    const exam = this.deps.getLibraryExam(examId);
    if (!exam) {
      alert(this.deps.getTranslations().examNotFound);
      return;
    }
    this.pendingAttempt = { examId, examTitle: exam.title };
    this.deps.setView("attemptConfig");
  }

  getPendingAttempt(): PendingAttempt | null {
    return this.pendingAttempt;
  }

  clearPendingAttempt(): void {
    this.pendingAttempt = null;
  }

  // ==========================================================================
  // Screen Display
  // ==========================================================================

  showAttemptConfigScreen(): void {
    if (!this.pendingAttempt) {
      this.deps.setView("library");
      return;
    }

    let configScreen = document.getElementById("attemptConfigScreen");
    if (!configScreen) {
      configScreen = createAttemptConfigScreen(this.deps.getTranslations(), {
        onStartMode: (mode) => this.startAttempt(mode),
        onBack: () => {
          this.pendingAttempt = null;
          this.deps.setView("library");
        },
      });
    }

    showAttemptConfigScreen(this.pendingAttempt.examTitle);
  }

  showAttemptExecutionScreen(): void {
    const isSimulacro =
      this.currentAttemptView?.mode === "simulacro" &&
      !!this.currentAttemptView?.timer;

    showExecutionScreen(isSimulacro);

    if (isSimulacro) {
      this.timerVisible = true;
      updateTimerVisibility(this.timerVisible, this.deps.getTranslations());
    }

    this.deps.practiceManager.resetFeedbackState();

    if (this.currentAttemptView) {
      this.deps.practiceManager.render(this.currentAttemptView);
      this.renderSimulacroTimer();
    }
  }

  async showResultsScreenFlow(): Promise<void> {
    if (!this.currentResultView) {
      this.deps.setView("library");
      return;
    }

    showResultsScreen();
    this.deps.practiceManager.renderResults(this.currentResultView);

    await this.populateScoreComparison();

    bindResultsActions({
      onTryAgain: () => {
        this.currentResultView = null;
        if (this.pendingAttempt) {
          this.deps.setView("attemptConfig");
        } else {
          this.deps.setView("library");
        }
      },
      onReviewAnswers: () => this.showReviewScreen(),
    });
  }

  // ==========================================================================
  // Attempt Creation
  // ==========================================================================

  private async startAttempt(
    mode: "free" | "simulacro" | "review",
  ): Promise<void> {
    if (!this.pendingAttempt) {
      this.deps.setView("library");
      return;
    }

    const { examId } = this.pendingAttempt;

    try {
      let timeLimitMs = 3600000;
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

      const viewState = await this.deps.attemptController.startAttempt({
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
      this.deps.setView("attemptExecution");

      if (mode === "simulacro") {
        this.startSimulacroTimer();
      }
    } catch (e) {
      console.error("Failed to start attempt:", e);
      alert("Failed to start attempt. Please try again.");
    }
  }

  // ==========================================================================
  // Simulacro Timer
  // ==========================================================================

  private renderSimulacroTimer(): void {
    if (!this.currentAttemptView?.timer) return;
    renderTimer(this.currentAttemptView.timer.remainingMs);
  }

  private startSimulacroTimer(): void {
    this.stopSimulacroTimer();
    this.timerVisible = true;

    if (this.currentAttemptView?.timer?.totalMs === 0) return;

    const TICK_INTERVAL = 1000;
    this.simulacroTimerInterval = setInterval(() => {
      if (!this.deps.attemptController.hasActiveSession()) {
        this.stopSimulacroTimer();
        return;
      }

      this.currentAttemptView = this.deps.attemptController.tick(TICK_INTERVAL);
      this.deps.practiceManager.render(this.currentAttemptView);
      this.renderSimulacroTimer();
      updateTimerVisibility(this.timerVisible, this.deps.getTranslations());

      if (this.currentAttemptView.isFinished) {
        this.stopSimulacroTimer();
        this.handleFinish();
      }
    }, TICK_INTERVAL);
  }

  stopSimulacroTimer(): void {
    if (this.simulacroTimerInterval !== null) {
      clearInterval(this.simulacroTimerInterval);
      this.simulacroTimerInterval = null;
    }
  }

  toggleTimerVisibility(): void {
    this.timerVisible = !this.timerVisible;
    updateTimerVisibility(this.timerVisible, this.deps.getTranslations());
  }

  // ==========================================================================
  // Answer Handling
  // ==========================================================================

  handleAnswer(answerIndex: number): void {
    if (!this.deps.attemptController.hasActiveSession()) return;

    this.currentAttemptView =
      this.deps.attemptController.submitAnswer(answerIndex);
    const answeredIndex = this.currentAttemptView.progress.current - 1;
    this._answeredIndicesCache.add(answeredIndex);

    this.deps.practiceManager.render(this.currentAttemptView);

    if (
      this.currentAttemptView.isAnswered &&
      this.currentAttemptView.feedback?.isCorrect
    ) {
      setTimeout(() => this.handleNext(), 500);
    }
  }

  handleNext(): void {
    if (!this.deps.attemptController.hasActiveSession()) return;
    this.currentAttemptView = this.deps.attemptController.nextQuestion();
    this.deps.practiceManager.resetFeedbackState();
    this.deps.practiceManager.render(this.currentAttemptView);
  }

  handlePrevious(): void {
    if (!this.deps.attemptController.hasActiveSession()) return;
    this.currentAttemptView = this.deps.attemptController.previousQuestion();
    this.deps.practiceManager.resetFeedbackState();
    this.deps.practiceManager.render(this.currentAttemptView);
  }

  handleGoTo(index: number): void {
    if (!this.deps.attemptController.hasActiveSession()) return;
    this.currentAttemptView = this.deps.attemptController.goToQuestion(index);
    this.deps.practiceManager.resetFeedbackState();
    this.deps.practiceManager.render(this.currentAttemptView);
  }

  handleFlag(): void {
    if (!this.currentAttemptView) return;
    const currentIndex = this.currentAttemptView.progress.current - 1;
    const flags = this.practiceUiState.flaggedQuestions;

    if (flags.has(currentIndex)) {
      flags.delete(currentIndex);
    } else {
      flags.add(currentIndex);
    }

    this.deps.practiceManager.render(this.currentAttemptView);
  }

  // ==========================================================================
  // Finish Flow
  // ==========================================================================

  handleFinishRequest(): void {
    if (!this.deps.attemptController.hasActiveSession()) {
      this.handleFinish();
      return;
    }
    if (!this.currentAttemptView) {
      this.handleFinish();
      return;
    }

    const state = this.currentAttemptView;
    const answeredIndices = this._answeredIndicesCache;
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

    renderSummaryModal(
      summaryData,
      navigatorItems,
      {
        onJump: (index) => this.handleGoTo(index),
        onSubmit: () => this.handleFinish(),
        onReturn: () => {
          /* close modal */
        },
      },
      this.deps.getTranslations(),
    );
  }

  async handleFinish(): Promise<void> {
    this.stopSimulacroTimer();
    this.cleanupPracticeSession();

    if (!this.deps.attemptController.hasActiveSession()) {
      if (this.pendingAttempt) {
        this.deps.setView("attemptConfig");
      } else {
        this.deps.setView("library");
      }
      return;
    }

    try {
      this.currentResultView =
        await this.deps.attemptController.finalizeAttempt();
      this.currentAttemptView = null;
      this.deps.setView("results");
    } catch (e) {
      console.error("Failed to finalize attempt:", e);
    }
  }

  /**
   * Abort the current attempt (used when navigating away).
   */
  abortAttempt(): void {
    this.stopSimulacroTimer();
    this.cleanupPracticeSession();
    this.deps.attemptController.abortAttempt();
    this.currentAttemptView = null;
  }

  // ==========================================================================
  // Practice Session Management
  // ==========================================================================

  private getAnsweredIndicesSet(): ReadonlySet<number> {
    return this._answeredIndicesCache;
  }

  private initPracticeSession(): void {
    this.practiceUiState = createPracticeSessionUiState();
    this._answeredIndicesCache = new Set();

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
      () => this.deps.attemptController.hasActiveSession(),
    );
  }

  private cleanupPracticeSession(): void {
    this.practiceUiState = createPracticeSessionUiState();
    this._answeredIndicesCache = new Set();
    this.cleanupKeyboardShortcuts?.();
    this.cleanupKeyboardShortcuts = null;
  }

  /**
   * Returns the flagged questions set (used by PracticeManager).
   */
  getFlaggedQuestions(): ReadonlySet<number> {
    return this.practiceUiState.flaggedQuestions;
  }

  /**
   * Returns the answered indices set (used by PracticeManager).
   */
  getAnsweredIndices(): ReadonlySet<number> {
    return this.getAnsweredIndicesSet();
  }

  // ==========================================================================
  // Score Comparison
  // ==========================================================================

  private async populateScoreComparison(): Promise<void> {
    const T = this.deps.getTranslations();
    try {
      await this.deps.refreshLibrary();
    } catch {
      // ignore
    }

    if (this.pendingAttempt) {
      const exam = this.deps.getLibraryExam(this.pendingAttempt.examId);
      renderScoreComparison(exam?.stats, T);
    } else {
      renderScoreComparison(undefined, T);
    }
  }

  // ==========================================================================
  // Review Navigation
  // ==========================================================================

  private showReviewScreen(): void {
    if (!this.currentResultView) return;

    const T = this.deps.getTranslations();
    this.deps.hideAllScreens();

    showReviewScreen();
    initReviewLabels(T);

    this.reviewCurrentIndex = 0;
    this.reviewFilteredQuestions = this.currentResultView.questionSummary;

    bindReviewFilters(
      () => this.renderReviewContent("all"),
      () => this.renderReviewContent("wrong"),
    );

    this.renderReviewContent("all");
  }

  private renderReviewContent(filter: "all" | "wrong"): void {
    if (!this.currentResultView) return;

    const T = this.deps.getTranslations();
    const summary = this.currentResultView.questionSummary;
    const filtered =
      filter === "all"
        ? summary
        : summary.filter((q) => !q.isCorrect && !q.isBlank);

    this.reviewFilteredQuestions = filtered;
    this.reviewCurrentIndex = 0;

    if (filtered.length === 0) {
      renderEmptyReviewState(filter, T);
    } else {
      this.renderCurrentReviewQuestion();
    }
    this.renderReviewNav();
  }

  private renderCurrentReviewQuestion(): void {
    if (!this.currentResultView) return;
    const filtered = this.reviewFilteredQuestions;
    if (filtered.length === 0) return;

    const q = filtered[this.reviewCurrentIndex];
    if (!q) return;

    renderReviewQuestion(
      q,
      this.reviewCurrentIndex,
      filtered.length,
      this.deps.getTranslations(),
      this.deps.practiceManager,
    );
  }

  private renderReviewNav(): void {
    if (!this.currentResultView) return;
    renderReviewNavigator(
      this.currentResultView.questionSummary,
      this.practiceUiState.flaggedQuestions,
      this.reviewCurrentIndex,
      (index) => {
        this.reviewCurrentIndex = index;
        this.renderCurrentReviewQuestion();
        this.renderReviewNav();
        scrollQuestionIntoView();
      },
    );
  }

  backToResults(): void {
    this.deps.setView("results");
  }

  reviewPrevQuestion(): void {
    if (this.reviewCurrentIndex > 0) {
      this.reviewCurrentIndex--;
      this.renderCurrentReviewQuestion();
      this.renderReviewNav();
      scrollQuestionIntoView();
    }
  }

  reviewNextQuestion(): void {
    if (this.reviewCurrentIndex < this.reviewFilteredQuestions.length - 1) {
      this.reviewCurrentIndex++;
      this.renderCurrentReviewQuestion();
      this.renderReviewNav();
      scrollQuestionIntoView();
    }
  }

  reviewNextWrong(): void {
    if (!this.currentResultView) return;
    const navItems = buildReviewNavItems(
      this.currentResultView.questionSummary,
      this.practiceUiState.flaggedQuestions,
      this.reviewCurrentIndex,
    );
    const idx = findNextWrongIndex(navItems, this.reviewCurrentIndex);
    if (idx >= 0) {
      this.reviewCurrentIndex = idx;
      this.renderCurrentReviewQuestion();
      this.renderReviewNav();
      scrollQuestionIntoView();
    }
  }

  reviewNextBlank(): void {
    if (!this.currentResultView) return;
    const navItems = buildReviewNavItems(
      this.currentResultView.questionSummary,
      this.practiceUiState.flaggedQuestions,
      this.reviewCurrentIndex,
    );
    const idx = findNextBlankIndex(navItems, this.reviewCurrentIndex);
    if (idx >= 0) {
      this.reviewCurrentIndex = idx;
      this.renderCurrentReviewQuestion();
      this.renderReviewNav();
      scrollQuestionIntoView();
    }
  }
}
