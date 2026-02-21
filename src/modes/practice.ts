/**
 * PracticeManager - Dumb UI Renderer
 *
 * This module is now a pure UI renderer for attempt execution.
 * All execution logic has been moved to AttemptRunner in app.ts.
 *
 * Responsibilities:
 * - Render AttemptSessionState to the DOM
 * - Emit user interaction callbacks
 *
 * Forbidden:
 * - No persistence logic
 * - No scoring calculation
 * - No attempt state management
 * - No telemetry updates
 * - No question shuffling
 */

import type { AttemptSessionState, Translations } from "../domain/types.js";

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
    // Navigation buttons
    document.getElementById("prevBtn")?.addEventListener("click", () => {
      // Previous is now handled internally by tracking currentIndex
      // For now, we only support forward navigation via the runner
      // This can be extended if needed
    });

    document.getElementById("nextBtn")?.addEventListener("click", () => {
      this.config.onNext();
    });

    // Results screen buttons
    document.getElementById("btnTryAgain")?.addEventListener("click", () => {
      this.config.onFinish();
    });

    document.getElementById("txtResultsMenu")?.parentElement?.addEventListener("click", () => {
      // Navigate back to library - handled by app.ts
    });
  }

  /**
   * Render the current attempt state
   *
   * This is the primary entry point for UI updates.
   * All state comes from AttemptSessionState.
   */
  render(state: AttemptSessionState): void {
    const T = this.config.getTranslations();

    // Get current question
    const question = state.questions[state.currentIndex];
    if (!question) return;

    const answer = state.answers[question.number];
    const hasAnswered = answer !== undefined;

    // Update progress indicators
    this.updateProgressBar(state);

    // Render question
    const questionText = document.getElementById("questionText");
    if (questionText) {
      questionText.textContent = question.text;
    }

    const questionNumber = document.getElementById("questionNumber");
    if (questionNumber) {
      questionNumber.textContent = `${T.question || "Question"} ${state.currentIndex + 1}/${state.questions.length}`;
    }

    // Render answers
    this.renderAnswers(question.answers, answer, hasAnswered, T);

    // Update navigation buttons
    this.updateNavigation(state, hasAnswered, T);

    // Show/hide feedback based on answer
    this.updateFeedback(answer, question, T);
  }

  /**
   * Render the results screen
   */
  renderResults(state: AttemptSessionState): void {
    if (!state.isFinished || !state.result) return;

    const T = this.config.getTranslations();
    const result = state.result;

    // Update score circle
    const scoreCircle = document.getElementById("scoreCircle");
    const scoreEl = document.getElementById("finalScore");
    if (scoreEl) {
      scoreEl.textContent = `${result.percentage}%`;
    }

    if (scoreCircle) {
      scoreCircle.className = `score-circle ${result.percentage >= 70 ? "good" : result.percentage >= 50 ? "medium" : "bad"}`;
      scoreCircle.style.setProperty("--score-percent", `${result.percentage}%`);
    }

    const scoreDetails = document.getElementById("scoreDetails");
    if (scoreDetails) {
      scoreDetails.textContent = `${result.correct} ${T.correctOutOf || "correct out of"} ${result.correct + result.wrong + result.blank}`;
    }

    // Render review summary
    this.renderReviewSummary(state, T);
  }

  /**
   * Render answer options
   */
  private renderAnswers(
    answers: { letter: string; text: string; isCorrect: boolean }[],
    answer: { selectedIndex: number | null; isCorrect: boolean } | undefined,
    hasAnswered: boolean,
    T: Translations
  ): void {
    const container = document.getElementById("answersContainer");
    if (!container) return;

    container.innerHTML = "";

    answers.forEach((ans, index) => {
      const div = document.createElement("div");
      div.className = "answer-option";

      const isSelected = answer?.selectedIndex === index;
      const showCorrect = hasAnswered && ans.isCorrect;
      const showWrong = isSelected && !answer?.isCorrect;

      if (showCorrect) {
        div.classList.add("correct");
      } else if (showWrong) {
        div.classList.add("wrong");
      } else if (isSelected) {
        div.classList.add("selected");
      }

      div.innerHTML = `
        <span class="answer-letter">${ans.letter}</span>
        <span class="answer-text">${ans.text}</span>
      `;

      // Only allow clicking if not answered yet
      if (!hasAnswered) {
        div.addEventListener("click", () => {
          this.config.onAnswer(index);
        });
      }

      container.appendChild(div);
    });
  }

  /**
   * Update progress bar
   */
  private updateProgressBar(state: AttemptSessionState): void {
    const progressBar = document.getElementById("progressBar");
    const progressText = document.getElementById("progressText");

    const total = state.questions.length;
    const answered = Object.keys(state.answers).length;
    const percentage = total > 0 ? (answered / total) * 100 : 0;

    if (progressBar) {
      progressBar.style.width = `${percentage}%`;
    }

    if (progressText) {
      progressText.textContent = `${answered}/${total}`;
    }
  }

  /**
   * Update navigation buttons
   */
  private updateNavigation(
    state: AttemptSessionState,
    hasAnswered: boolean,
    T: Translations
  ): void {
    const prevBtn = document.getElementById("prevBtn") as HTMLButtonElement | null;
    const nextBtn = document.getElementById("nextBtn") as HTMLButtonElement | null;
    const finishBtn = document.getElementById("finishBtn") as HTMLButtonElement | null;

    const isLastQuestion = state.currentIndex >= state.questions.length - 1;
    const allAnswered = Object.keys(state.answers).length >= state.questions.length;

    if (prevBtn) {
      prevBtn.disabled = state.currentIndex === 0;
      prevBtn.classList.toggle("disabled", state.currentIndex === 0);
    }

    if (nextBtn) {
      // Show "Next" if answered and not last, hide otherwise
      const showNext = hasAnswered && !isLastQuestion;
      nextBtn.style.display = showNext ? "block" : "none";
      if (showNext) {
        nextBtn.textContent = T.next || "Next";
      }
    }

    if (finishBtn) {
      // Show "Finish" on last question or when all answered
      const showFinish = (isLastQuestion && hasAnswered) || allAnswered;
      finishBtn.style.display = showFinish ? "block" : "none";
      finishBtn.textContent = T.finish || "Finish";

      // Bind finish handler
      finishBtn.onclick = () => {
        this.config.onFinish();
      };
    }
  }

  /**
   * Update feedback display
   */
  private updateFeedback(
    answer: { selectedIndex: number | null; isCorrect: boolean } | undefined,
    question: { articulo_referencia: string; feedback: { cita_literal: string; explicacion_fallo: string } },
    T: Translations
  ): void {
    const feedbackSection = document.getElementById("feedbackSection");
    if (!feedbackSection) return;

    if (!answer) {
      feedbackSection.classList.add("hidden");
      return;
    }

    feedbackSection.classList.remove("hidden");

    const feedbackTitle = document.getElementById("feedbackTitle");
    const feedbackClass = answer.isCorrect ? "correct" : "wrong";

    if (feedbackTitle) {
      feedbackTitle.textContent = answer.isCorrect
        ? T.correctAnswer || "Correct!"
        : T.wrongAnswer || "Incorrect";
      feedbackTitle.className = feedbackClass;
    }

    const referenceArticle = document.getElementById("referenceArticle");
    if (referenceArticle) {
      referenceArticle.textContent = `${T.referenceArticle || "Reference"}: ${question.articulo_referencia}`;
    }

    const literalCitation = document.getElementById("literalCitation");
    if (literalCitation) {
      literalCitation.textContent = question.feedback.cita_literal;
    }

    const explanation = document.getElementById("explanation");
    if (explanation) {
      explanation.textContent = question.feedback.explicacion_fallo;
    }
  }

  /**
   * Render review summary for results screen
   */
  private renderReviewSummary(state: AttemptSessionState, T: Translations): void {
    const summary = document.getElementById("reviewSummary");
    if (!summary) return;

    summary.innerHTML = "";

    state.questions.forEach((q) => {
      const answer = state.answers[q.number];
      const div = document.createElement("div");
      div.className = "review-item";
      div.textContent = String(q.number);

      if (answer) {
        div.classList.add(answer.isCorrect ? "correct" : "incorrect");
      } else {
        div.classList.add("unanswered");
      }

      summary.appendChild(div);
    });
  }
}
