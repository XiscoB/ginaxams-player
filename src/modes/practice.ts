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
   * Bind DOM events for navigation
   */
  private bindEvents(): void {
    document.getElementById("nextBtn")?.addEventListener("click", () => {
      this.config.onNext();
    });

    document.getElementById("btnTryAgain")?.addEventListener("click", () => {
      this.config.onFinish();
    });
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
    } = result;

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
        const resultAns = ans as AnswerViewWithResult;
        if (resultAns.isCorrect) {
          div.classList.add("correct");
        } else if (resultAns.isSelected && !resultAns.isCorrect) {
          div.classList.add("wrong");
        } else if (resultAns.isSelected) {
          div.classList.add("selected");
        }
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
   * Update feedback display from view state.
   * Uses the feedback-panel component for clear visual separation.
   */
  private updateFeedback(state: AttemptViewState, T: Translations): void {
    const feedbackSection = document.getElementById("feedbackSection");
    if (!feedbackSection) return;

    if (!state.feedback) {
      feedbackSection.classList.add("hidden");
      feedbackSection.innerHTML = "";
      return;
    }

    feedbackSection.classList.remove("hidden");

    const isCorrect = state.feedback.isCorrect;
    const panelClass = isCorrect ? "feedback-panel--correct" : "feedback-panel--wrong";
    const headerIcon = isCorrect ? "✓" : "✗";

    let headerText: string;
    if (isCorrect) {
      headerText = T.correctAnswer || "Correct!";
    } else {
      const selected = state.feedback.selectedAnswer ?? "—";
      const correct = state.feedback.correctAnswer;
      headerText = `${T.wrongAnswer || "Incorrect"} (${selected} → ${correct})`;
    }

    feedbackSection.innerHTML = `
      <div class="feedback-panel ${panelClass}">
        <div class="feedback-panel__header">
          <span>${headerIcon}</span>
          <span>${headerText}</span>
        </div>
        <div class="feedback-panel__body">
          <div class="feedback-panel__field">
            <span class="feedback-panel__label">${T.referenceArticle || "Reference"}</span>
            <span class="feedback-panel__value">${state.feedback.referenceArticle}</span>
          </div>
          <div class="feedback-panel__field">
            <span class="feedback-panel__label">${T.literalCitation || "Citation"}</span>
            <blockquote class="feedback-panel__citation">${state.feedback.literalCitation}</blockquote>
          </div>
          <div class="feedback-panel__field">
            <span class="feedback-panel__label">${T.explanation || "Explanation"}</span>
            <span class="feedback-panel__value">${state.feedback.explanation}</span>
          </div>
        </div>
      </div>
    `;
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
}
