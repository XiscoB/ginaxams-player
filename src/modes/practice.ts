/**
 * PracticeManager - Dumb UI Renderer
 *
 * This module is a pure UI renderer for attempt execution.
 * It receives pre-computed view state from the application layer
 * and renders it to the DOM.
 *
 * Responsibilities:
 * - Render AttemptViewState to the DOM
 * - Render AttemptResultViewState to the results screen
 * - Emit user interaction callbacks
 *
 * Forbidden:
 * - No domain imports
 * - No storage imports
 * - No persistence logic
 * - No scoring calculation
 * - No attempt state management
 * - No telemetry updates
 * - No question shuffling
 */

import type {
  AttemptViewState,
  AttemptResultViewState,
  AnswerViewWithResult,
  QuestionResultView,
} from "../application/viewState.js";
import type { Translations } from "../i18n/index.js";

/**
 * Type guard: checks whether the answers include result information.
 */
function isAnsweredView(
  answers: AttemptViewState["answers"],
): answers is AnswerViewWithResult[] {
  return answers.length > 0 && "isCorrect" in answers[0];
}

export interface PracticeManagerConfig {
  onAnswer: (answerIndex: number) => void;
  onNext: () => void;
  onFinish: () => void;
  getTranslations: () => Translations;
}

/**
 * PracticeManager - Pure UI renderer for attempt execution
 */
export class PracticeManager {
  private config: PracticeManagerConfig;

  constructor(config: PracticeManagerConfig) {
    this.config = config;
    this.bindEvents();
  }

  /**
   * Reset feedback tracking state.
   * Call when starting a new attempt or navigating to a new question.
   * Clears both the memoization key and the DOM element.
   */
  resetFeedbackState(): void {
    this.lastRenderedFeedbackKey = null;
    const feedbackSection = document.getElementById("feedbackSection");
    if (feedbackSection) {
      feedbackSection.classList.add("hidden");
      feedbackSection.innerHTML = "";
    }
  }

  /**
   * Bind DOM events for navigation
   */
  private bindEvents(): void {
    document.getElementById("nextBtn")?.addEventListener("click", () => {
      this.config.onNext();
    });

    // btnTryAgain is handled dynamically via onclick in renderResults
    // to avoid stale handler issues when session is already cleared
  }

  /**
   * Render the current attempt view state.
   *
   * This is the primary entry point for UI updates.
   * All data comes pre-computed from the application layer.
   */
  render(state: AttemptViewState): void {
    const T = this.config.getTranslations();

    // Update progress indicators
    this.updateProgressBar(state);

    // Render question
    const questionText = document.getElementById("questionText");
    if (questionText) {
      questionText.textContent = state.questionText;
    }

    const questionNumber = document.getElementById("questionNumber");
    if (questionNumber) {
      questionNumber.textContent = `${T.question || "Question"} ${state.progress.current}/${state.progress.total}`;
    }

    // Render answers
    this.renderAnswers(state);

    // Update navigation buttons
    this.updateNavigation(state, T);

    // Show/hide feedback
    this.updateFeedback(state, T);
  }

  /**
   * Render the results screen from a completed attempt result.
   */
  renderResults(result: AttemptResultViewState): void {
    const T = this.config.getTranslations();
    const {
      result: score,
      scoreCategory,
      totalQuestions,
      timeSpentMs,
      mode,
    } = result;

    // Update mode label
    const modeLabel = document.getElementById("resultModeLabel");
    if (modeLabel) {
      const modeNames: Record<string, string> = {
        free: T.modeFree || "Free",
        simulacro: T.modeSimulacro || "Simulacro",
        review: T.modeReview || "Review",
      };
      modeLabel.textContent = `${T.modeLabel || "Mode"}: ${modeNames[mode] || mode}`;
    }

    // Update score circle
    const scoreCircle = document.getElementById("scoreCircle");
    const scoreEl = document.getElementById("finalScore");
    if (scoreEl) {
      scoreEl.textContent = `${score.percentage}%`;
    }

    if (scoreCircle) {
      scoreCircle.className = `score-circle ${scoreCategory}`;
      scoreCircle.style.setProperty("--score-percent", `${score.percentage}%`);
    }

    const scoreDetails = document.getElementById("scoreDetails");
    if (scoreDetails) {
      scoreDetails.textContent = `${score.correct} ${T.correctOutOf || "correct out of"} ${totalQuestions}`;
    }

    // Update structured stats grid
    const correctCount = document.getElementById("resultCorrectCount");
    if (correctCount) correctCount.textContent = String(score.correct);

    const wrongCount = document.getElementById("resultWrongCount");
    if (wrongCount) wrongCount.textContent = String(score.wrong);

    const blankCount = document.getElementById("resultBlankCount");
    if (blankCount) blankCount.textContent = String(score.blank);

    // Score value
    const scoreValue = document.getElementById("resultScoreValue");
    if (scoreValue) scoreValue.textContent = `${score.percentage}%`;

    // Total questions
    const totalQEl = document.getElementById("resultTotalQuestions");
    if (totalQEl) totalQEl.textContent = String(totalQuestions);

    // Update time spent display
    const timeDisplay = document.getElementById("timeSpent");
    if (timeDisplay) {
      const totalSeconds = Math.floor(timeSpentMs / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      timeDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, "0")}`;
    }

    // Update translated labels on the results screen
    const txtScoreSummary = document.getElementById("txtScoreSummary");
    if (txtScoreSummary)
      txtScoreSummary.textContent = T.scoreSummary || "Score Summary";

    const txtCorrectLabel = document.getElementById("txtResultCorrectLabel");
    if (txtCorrectLabel) txtCorrectLabel.textContent = T.correct || "Correct";

    const txtWrongLabel = document.getElementById("txtResultWrongLabel");
    if (txtWrongLabel) txtWrongLabel.textContent = T.wrong || "Wrong";

    const txtBlankLabel = document.getElementById("txtResultBlankLabel");
    if (txtBlankLabel) txtBlankLabel.textContent = T.blank || "Blank";

    const txtScoreLabel = document.getElementById("txtResultScoreLabel");
    if (txtScoreLabel) txtScoreLabel.textContent = T.score || "Score";

    const txtStatistics = document.getElementById("txtStatistics");
    if (txtStatistics) txtStatistics.textContent = T.statistics || "Statistics";

    const txtTotalQuestions = document.getElementById("txtTotalQuestions");
    if (txtTotalQuestions)
      txtTotalQuestions.textContent = T.totalQuestions || "Total Questions";

    const txtTimeSpent = document.getElementById("txtTimeSpent");
    if (txtTimeSpent) txtTimeSpent.textContent = T.timeSpent || "Time Spent";

    const txtResults = document.getElementById("txtResults");
    if (txtResults) txtResults.textContent = T.results || "🏆 Results";

    const lblTryAgain = document.getElementById("lblTryAgain");
    if (lblTryAgain) lblTryAgain.textContent = T.tryAgain || "Try Again";

    const lblReviewAnswers = document.getElementById("lblReviewAnswers");
    if (lblReviewAnswers)
      lblReviewAnswers.textContent = T.reviewAnswers || "Review Answers";

    const txtReviewSummaryTitle = document.getElementById(
      "txtReviewSummaryTitle",
    );
    if (txtReviewSummaryTitle)
      txtReviewSummaryTitle.textContent = T.reviewSummary || "Review Summary";

    const txtBackToLibraryBtn = document.getElementById("txtBackToLibraryBtn");
    if (txtBackToLibraryBtn)
      txtBackToLibraryBtn.textContent = T.backToLibrary || "📚 Back to Library";

    const txtLastScore = document.getElementById("txtLastScore");
    if (txtLastScore) txtLastScore.textContent = T.lastScore || "Last Score";

    const txtBestScore = document.getElementById("txtBestScore");
    if (txtBestScore) txtBestScore.textContent = T.bestScore || "Best Score";

    // Render per-question review summary
    this.renderReviewSummary(result);
  }

  /**
   * Render answer options from the view state.
   */
  private renderAnswers(state: AttemptViewState): void {
    const container = document.getElementById("answersContainer");
    if (!container) return;

    container.innerHTML = "";

    const answered = isAnsweredView(state.answers);

    state.answers.forEach((ans) => {
      const div = document.createElement("div");
      div.className = "answer-option";

      if (answered) {
        // Full correctness info available (free mode, review, simulacro with feedback)
        const resultAns = ans as AnswerViewWithResult;
        if (resultAns.isCorrect) {
          div.classList.add("correct");
        } else if (resultAns.isSelected && !resultAns.isCorrect) {
          div.classList.add("wrong");
        } else if (resultAns.isSelected) {
          div.classList.add("selected");
        }
      } else if (state.isAnswered && state.selectedAnswerIndex === ans.index) {
        // No correctness info but answered (simulacro without feedback) —
        // show neutral selection highlight only
        div.classList.add("selected");
      }

      div.innerHTML = `
        <span class="answer-letter">${ans.letter}</span>
        <span class="answer-text">${ans.text}</span>
      `;

      // Only allow clicking if not yet answered
      if (!state.isAnswered) {
        div.addEventListener("click", () => {
          this.config.onAnswer(ans.index);
        });
      }

      container.appendChild(div);
    });
  }

  /**
   * Update progress bar from view state.
   */
  private updateProgressBar(state: AttemptViewState): void {
    const progressBar = document.getElementById("progressBar");
    const progressText = document.getElementById("progressText");

    const { total, answered } = state.progress;
    const percentage = total > 0 ? (answered / total) * 100 : 0;

    if (progressBar) {
      progressBar.style.width = `${percentage}%`;
    }

    if (progressText) {
      progressText.textContent = `${answered}/${total}`;
    }
  }

  /**
   * Update navigation buttons from view state.
   */
  private updateNavigation(state: AttemptViewState, T: Translations): void {
    const prevBtn = document.getElementById(
      "prevBtn",
    ) as HTMLButtonElement | null;
    const nextBtn = document.getElementById(
      "nextBtn",
    ) as HTMLButtonElement | null;
    const finishBtn = document.getElementById(
      "finishBtn",
    ) as HTMLButtonElement | null;

    if (prevBtn) {
      prevBtn.disabled = !state.canGoPrevious;
      prevBtn.classList.toggle("disabled", !state.canGoPrevious);
    }

    if (nextBtn) {
      nextBtn.style.display = state.canGoNext ? "block" : "none";
      if (state.canGoNext) {
        nextBtn.textContent = T.next || "Next";
      }
    }

    if (finishBtn) {
      finishBtn.style.display = state.canFinish ? "block" : "none";
      finishBtn.textContent = T.finish || "Finish";

      finishBtn.onclick = () => {
        this.config.onFinish();
      };
    }
  }

  /**
   * Track the last rendered feedback state to prevent flicker on re-renders.
   * Stores `questionNumber:isCorrect` to detect whether feedback has changed.
   */
  private lastRenderedFeedbackKey: string | null = null;

  /**
   * Update feedback display from view state.
   * Uses the feedback-panel component for clear visual separation.
   * Skips re-render if the feedback hasn't changed (prevents flicker
   * when timer ticks trigger frequent render cycles).
   */
  private updateFeedback(state: AttemptViewState, T: Translations): void {
    const feedbackSection = document.getElementById("feedbackSection");
    if (!feedbackSection) return;

    // Guard: feedback must only appear when the question has been answered
    if (!state.feedback || !state.isAnswered) {
      // Always clear feedback DOM regardless of memoization state
      feedbackSection.classList.add("hidden");
      feedbackSection.innerHTML = "";
      this.lastRenderedFeedbackKey = null;
      return;
    }

    // Build a question-scoped key to detect whether feedback content changed.
    // Uses progress.current (position in attempt) + questionNumber + correctness
    // to guarantee uniqueness and prevent cross-question feedback reuse.
    const feedbackKey = `${state.progress.current}:${state.questionNumber}:${state.feedback.isCorrect}`;
    if (feedbackKey === this.lastRenderedFeedbackKey) {
      // Feedback already rendered for this question — skip to avoid flicker
      return;
    }

    this.lastRenderedFeedbackKey = feedbackKey;
    feedbackSection.classList.remove("hidden");

    const headerText = this.buildFeedbackHeaderText(
      state.feedback.isCorrect,
      state.feedback.selectedAnswer,
      state.feedback.correctAnswer,
      T,
    );

    this.renderFeedbackPanelHTML(
      feedbackSection,
      state.feedback.isCorrect,
      headerText,
      state.feedback.referenceArticle,
      state.feedback.literalCitation,
      state.feedback.explanation,
      T,
    );
  }

  /**
   * Render per-question review summary for the results screen.
   */
  private renderReviewSummary(result: AttemptResultViewState): void {
    const summary = document.getElementById("reviewSummary");
    if (!summary) return;

    summary.innerHTML = "";

    result.questionSummary.forEach((q) => {
      const div = document.createElement("div");
      div.className = "review-item";
      div.textContent = String(q.questionNumber);

      if (q.isBlank) {
        div.classList.add("unanswered");
      } else if (q.isCorrect) {
        div.classList.add("correct");
      } else {
        div.classList.add("incorrect");
      }

      summary.appendChild(div);
    });
  }

  /**
   * Render a feedback panel into a given container element.
   * Reuses the same HTML structure as the practice-mode feedback.
   * Used by the review screen to display explanation details.
   */
  renderFeedbackPanel(
    container: HTMLElement,
    question: QuestionResultView,
    T: Translations,
  ): void {
    if (
      !question.referenceArticle &&
      !question.literalCitation &&
      !question.explanation
    ) {
      container.classList.add("hidden");
      container.innerHTML = "";
      return;
    }

    container.classList.remove("hidden");

    const headerText = this.buildFeedbackHeaderText(
      question.isCorrect,
      question.selectedAnswerLetter,
      question.correctAnswerLetter,
      T,
    );

    this.renderFeedbackPanelHTML(
      container,
      question.isCorrect,
      headerText,
      question.referenceArticle || "",
      question.literalCitation || "",
      question.explanation || "",
      T,
    );
  }

  // ==========================================================================
  // Private — Shared Feedback Rendering
  // ==========================================================================

  /**
   * Build the header text for a feedback panel.
   * Single source of truth for both in-exam and review feedback headers.
   */
  private buildFeedbackHeaderText(
    isCorrect: boolean,
    selectedAnswer: string | null | undefined,
    correctAnswer: string,
    T: Translations,
  ): string {
    if (isCorrect) {
      return T.correctAnswer || "Correct!";
    }
    const selected = selectedAnswer ?? "—";
    return `${T.wrongAnswer || "Incorrect"} (${selected} → ${correctAnswer})`;
  }

  /**
   * Render unified feedback panel HTML into a container.
   * Single renderer used by both updateFeedback (in-exam) and
   * renderFeedbackPanel (review screen) to ensure layout consistency.
   */
  private renderFeedbackPanelHTML(
    container: HTMLElement,
    isCorrect: boolean,
    headerText: string,
    referenceArticle: string,
    literalCitation: string,
    explanation: string,
    T: Translations,
  ): void {
    const panelClass = isCorrect
      ? "feedback-panel--correct"
      : "feedback-panel--wrong";
    const headerIcon = isCorrect ? "✓" : "✗";

    container.innerHTML = `
      <div class="feedback-panel ${panelClass}">
        <div class="feedback-panel__header">
          <span>${headerIcon}</span>
          <span>${headerText}</span>
        </div>
        <div class="feedback-panel__body">
          <div class="feedback-panel__field">
            <span class="feedback-panel__label">${T.referenceArticle || "Reference"}</span>
            <span class="feedback-panel__value">${referenceArticle}</span>
          </div>
          <div class="feedback-panel__field">
            <span class="feedback-panel__label">${T.literalCitation || "Citation"}</span>
            <blockquote class="feedback-panel__citation">${literalCitation}</blockquote>
          </div>
          <div class="feedback-panel__field">
            <span class="feedback-panel__label">${T.explanation || "Explanation"}</span>
            <span class="feedback-panel__value">${explanation}</span>
          </div>
        </div>
      </div>
    `;
  }
}
