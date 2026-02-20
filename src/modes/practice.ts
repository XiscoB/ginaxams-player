/**
 * Practice Mode Manager
 * 
 * Handles the actual taking of exams and reviewing results.
 * This module manages the practice and review screens.
 */

import type {
  ExamData,
  Question,
  PracticeOptions,
  UserAnswers,
  Translations,
} from "../domain/types.js";
import { shuffleArray } from "../domain/scoring.js";

export type PracticeMode = "practice" | "review";
export type FilterType = "all" | "wrong";

export interface PracticeManagerConfig {
  getQuestionResult: (examId: string, questionNum: number) => boolean | null;
  saveProgress: (examId: string, questionNum: number, wasCorrect: boolean) => Promise<void>;
  saveScore: (examId: string, score: number) => Promise<{ lastScore: number | null; bestScore: number | null }>;
  incrementAttempt: (examId: string) => Promise<void>;
  onShowFileScreen: () => void;
  onShowModeScreen: () => void;
  getTranslations: () => Translations;
}

/**
 * Practice Manager - handles exam practice and review logic
 */
export class PracticeManager {
  private config: PracticeManagerConfig;

  // State
  private examData: ExamData | null = null;
  private currentQuestions: Question[] = [];
  private filteredQuestions: Question[] = [];
  private currentIndex = 0;
  private userAnswers: UserAnswers = {};
  private mode: PracticeMode = "practice";

  private showFeedback = true;

  constructor(config: PracticeManagerConfig) {
    this.config = config;
    this.bindEvents();
  }

  /**
   * Get current exam data
   */
  getExamData(): ExamData | null {
    return this.examData;
  }

  /**
   * Bind DOM events for navigation
   */
  private bindEvents(): void {
    // Navigation
    document.getElementById("prevBtn")?.addEventListener("click", () => this.prevQuestion());
    document.getElementById("nextBtn")?.addEventListener("click", () => this.nextQuestion());

    // Review Navigation
    document.getElementById("filterAll")?.addEventListener("click", () => this.filterQuestions("all"));
    document.getElementById("filterWrong")?.addEventListener("click", () => this.filterQuestions("wrong"));

    // Exit buttons
    document.getElementById("txtExitReview")?.parentElement?.addEventListener("click", () => {
      this.config.onShowFileScreen();
    });

    document.getElementById("btnTryAgain")?.addEventListener("click", () => {
      this.config.onShowModeScreen();
    });

    document.getElementById("btnReviewAnswers")?.addEventListener("click", () => {
      this.startReview();
    });

    document.getElementById("txtResultsMenu")?.parentElement?.addEventListener("click", () => {
      this.config.onShowFileScreen();
    });
  }

  // ============================================================================
  // Start Methods
  // ============================================================================

  /**
   * Start practice mode with the given exam
   */
  startPractice(examData: ExamData, options: Partial<PracticeOptions> = {}): void {
    this.examData = examData;
    this.mode = "practice";
    this.currentQuestions = [...examData.questions];

    if (options.shuffleQuestions) {
      this.currentQuestions = shuffleArray(this.currentQuestions);
    }

    if (options.shuffleAnswers) {
      this.currentQuestions = this.currentQuestions.map((q) => ({
        ...q,
        answers: shuffleArray([...q.answers]),
      }));
    }

    this.currentIndex = 0;
    this.userAnswers = {};
    this.showFeedback = options.showFeedback !== false;

    this.hideAllScreens();
    const practiceScreen = document.getElementById("practiceScreen");
    if (practiceScreen) {
      practiceScreen.classList.remove("hidden");
    }
    this.renderQuestion();
  }

  /**
   * Start review mode
   */
  startReview(examData: ExamData | null = this.examData): void {
    if (!examData) return;

    this.examData = examData;
    this.mode = "review";
    

    // Reset to original order for consistent numbering
    this.currentQuestions = [...this.examData.questions];
    this.filteredQuestions = [...this.currentQuestions];

    this.currentIndex = 0;

    // Count wrong answers to disable "Wrong" button if none
    const wrongCount = this.currentQuestions.filter((q) => !q.wasCorrect).length;

    // Update UI
    const filterAll = document.getElementById("filterAll");
    const filterWrong = document.getElementById("filterWrong") as HTMLButtonElement | null;

    if (filterAll) {
      filterAll.classList.add("active");
    }

    if (filterWrong) {
      filterWrong.classList.remove("active");

      if (wrongCount === 0) {
        filterWrong.disabled = true;
        filterWrong.classList.add("disabled");
        const T = this.config.getTranslations();
        filterWrong.title = T.noWrongAnswers || "No wrong answers to review";
      } else {
        filterWrong.disabled = false;
        filterWrong.classList.remove("disabled");
        filterWrong.title = "";
      }
    }

    this.hideAllScreens();
    const reviewScreen = document.getElementById("reviewScreen");
    if (reviewScreen) {
      reviewScreen.classList.remove("hidden");
    }
    this.renderReviewQuestion();
  }

  // ============================================================================
  // Navigation
  // ============================================================================

  /**
   * Select an answer for the current question
   */
  selectAnswer(answerIndex: number): void {
    // Only allow answering once in practice mode
    if (this.userAnswers[this.currentIndex] !== undefined) return;

    this.userAnswers[this.currentIndex] = answerIndex;

    const q = this.currentQuestions[this.currentIndex];
    const isCorrect = q.answers[answerIndex]?.isCorrect ?? false;

    // Save progress
    if (this.examData) {
      this.config.saveProgress(this.examData.exam_id, q.number, isCorrect);
    }

    if (isCorrect) {
      this.renderQuestion(); // Show feedback
      setTimeout(() => {
        if (this.currentIndex < this.currentQuestions.length - 1) {
          this.currentIndex++;
          this.renderQuestion();
        } else {
          this.showResults();
        }
      }, 500);
    } else {
      this.renderQuestion(); // Show feedback (red)
    }
  }

  /**
   * Go to previous question
   */
  prevQuestion(): void {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      if (this.mode === "practice") {
        this.renderQuestion();
      } else {
        this.renderReviewQuestion();
      }
    }
  }

  /**
   * Go to next question
   */
  nextQuestion(): void {
    const total = this.mode === "practice" 
      ? this.currentQuestions.length 
      : this.filteredQuestions.length;

    if (this.currentIndex < total - 1) {
      this.currentIndex++;
      if (this.mode === "practice") {
        this.renderQuestion();
      } else {
        this.renderReviewQuestion();
      }
    } else if (this.mode === "practice") {
      this.showResults();
    }
  }

  /**
   * Filter questions in review mode
   */
  filterQuestions(filter: FilterType): void {
    void filter; // mark as used
    const filterAll = document.getElementById("filterAll");
    const filterWrong = document.getElementById("filterWrong");

    if (filter === "all") {
      filterAll?.classList.add("active");
      filterWrong?.classList.remove("active");
      this.filteredQuestions = [...this.currentQuestions];
    } else {
      filterAll?.classList.remove("active");
      filterWrong?.classList.add("active");

      this.filteredQuestions = this.currentQuestions.filter((q) => {
        // Check stored progress via App
        if (this.examData) {
          const storedResult = this.config.getQuestionResult(this.examData.exam_id, q.number);
          if (storedResult !== null) return !storedResult;
        }
        return !q.wasCorrect;
      });
    }

    this.currentIndex = 0;
    if (this.filteredQuestions.length === 0) {
      const T = this.config.getTranslations();
      alert(T.noQuestionsMatch || "No questions match this filter!");
      this.filterQuestions("all");
      return;
    }
    this.renderReviewQuestion();
  }

  // ============================================================================
  // Rendering
  // ============================================================================

  /**
   * Render images for a question
   */
  private renderImages(containerId: string, question: Question): void {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = "";
    if (question.images && question.images.length > 0) {
      question.images.forEach((imgUrl) => {
        const img = document.createElement("img");
        img.src = imgUrl;
        img.alt = "Question image";
        img.onerror = () => {
          img.style.display = "none";
        };
        container.appendChild(img);
      });
    }
  }

  /**
   * Render the question minimap
   */
  private renderMinimap(
    containerId: string,
    questions: Question[],
    getCurrentFn: () => number
  ): void {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = "";

    questions.forEach((q, i) => {
      const div = document.createElement("div");
      div.className = "minimap-item";

      // Determine status
      if (this.mode === "practice") {
        if (this.userAnswers[i] !== undefined) {
          const ans = q.answers[this.userAnswers[i]];
          div.classList.add(ans?.isCorrect ? "user-correct" : "user-incorrect");
        } else {
          div.classList.add("unanswered");
        }
      } else {
        // Review mode
        const isCorrect = this.examData
          ? this.config.getQuestionResult(this.examData.exam_id, q.number) ?? q.wasCorrect
          : q.wasCorrect;
        div.classList.add(isCorrect ? "was-correct" : "was-incorrect");
      }

      if (i === getCurrentFn()) {
        div.classList.add("current");
      }

      div.textContent = String(q.number);
      div.onclick = () => {
        this.currentIndex = i;
        if (this.mode === "practice") {
          this.renderQuestion();
        } else {
          this.renderReviewQuestion();
        }
      };

      container.appendChild(div);
    });
  }

  /**
   * Render the current practice question
   */
  private renderQuestion(): void {
    const q = this.currentQuestions[this.currentIndex];
    if (!q) return;

    const total = this.currentQuestions.length;
    const T = this.config.getTranslations();

    // Update progress bars and text
    const progBar = document.getElementById("progressBar") as HTMLElement | null;
    if (progBar) {
      progBar.style.width = `${(100 * (this.currentIndex + 1)) / total}%`;
    }

    const progText = document.getElementById("progressText");
    if (progText) {
      progText.textContent = `${T.question} ${this.currentIndex + 1} ${T.questionOf} ${total}`;
    }

    // Status
    const storedRes = this.examData
      ? this.config.getQuestionResult(this.examData.exam_id, q.number)
      : null;
    const isCorrect = storedRes ?? q.wasCorrect ?? false;
    const statusText = isCorrect ? T.mastered : T.needsPractice;
    const statusClass = isCorrect ? "was-correct" : "was-incorrect";

    const questionNumber = document.getElementById("questionNumber");
    if (questionNumber) {
      questionNumber.innerHTML = `${T.question} ${q.number} <span class="question-status ${statusClass}">${statusText}</span>`;
    }

    this.renderImages("questionImages", q);

    const questionText = document.getElementById("questionText");
    if (questionText) {
      questionText.textContent = q.text;
    }

    this.renderMinimap("practiceMinimapContainer", this.currentQuestions, () => this.currentIndex);

    // Answers
    const container = document.getElementById("answersContainer");
    if (!container) return;

    container.innerHTML = "";

    const hasAnswered = this.userAnswers[this.currentIndex] !== undefined;

    q.answers.forEach((ans, i) => {
      const div = document.createElement("div");
      div.className = "answer-option";

      if (hasAnswered) {
        if (this.userAnswers[this.currentIndex] === i) {
          div.classList.add("selected");
          if (this.showFeedback) {
            div.classList.add(ans.isCorrect ? "correct" : "incorrect");
          }
        }
        if (this.showFeedback && ans.isCorrect) {
          div.classList.add("show-correct");
        }
      }

      div.innerHTML = `
        <span class="answer-letter">${ans.letter}</span>
        <span class="answer-text">${ans.text}</span>
        ${hasAnswered && this.showFeedback
          ? ans.isCorrect
            ? '<span class="answer-icon">✓</span>'
            : this.userAnswers[this.currentIndex] === i
              ? '<span class="answer-icon">✗</span>'
              : ""
          : ""
        }
      `;

      if (!hasAnswered) {
        div.onclick = () => this.selectAnswer(i);
      }

      container.appendChild(div);
    });

    // Nav Buttons
    const prevBtn = document.getElementById("prevBtn") as HTMLButtonElement | null;
    if (prevBtn) {
      prevBtn.disabled = this.currentIndex === 0;
    }

    const nextBtn = document.getElementById("nextBtn");
    const nextBtnSpan = nextBtn?.querySelector("span");
    if (nextBtn && nextBtnSpan) {
      if (this.currentIndex === total - 1) {
        nextBtnSpan.textContent = T.finish;
        nextBtn.className = "nav-btn finish";
      } else {
        nextBtnSpan.textContent = T.next;
        nextBtn.className = "nav-btn next";
      }
    }
  }

  /**
   * Render the current review question
   */
  private renderReviewQuestion(): void {
    const q = this.filteredQuestions[this.currentIndex];
    if (!q) return;

    const total = this.filteredQuestions.length;
    const T = this.config.getTranslations();

    const reviewProgressBar = document.getElementById("reviewProgressBar") as HTMLElement | null;
    if (reviewProgressBar) {
      reviewProgressBar.style.width = `${(100 * (this.currentIndex + 1)) / total}%`;
    }

    const reviewProgressText = document.getElementById("reviewProgressText");
    if (reviewProgressText) {
      reviewProgressText.textContent = `${T.question} ${this.currentIndex + 1} ${T.questionOf} ${total}`;
    }

    const reviewQuestionNumber = document.getElementById("reviewQuestionNumber");
    if (reviewQuestionNumber) {
      reviewQuestionNumber.textContent = `${T.question} ${q.number}`;
    }

    this.renderImages("reviewQuestionImages", q);

    const reviewQuestionText = document.getElementById("reviewQuestionText");
    if (reviewQuestionText) {
      reviewQuestionText.textContent = q.text;
    }

    // Correct answer text
    const correctAns = q.answers.find((a) => a.isCorrect);
    const correctAnswerText = document.getElementById("correctAnswerText");
    if (correctAnswerText) {
      correctAnswerText.textContent = correctAns?.text ?? T.unknown;
    }

    // Minimap
    const originalList = this.currentQuestions;
    this.renderMinimap("reviewMinimapContainer", originalList, () => {
      return originalList.findIndex((oq) => oq.number === q.number);
    });

    // Answers
    const container = document.getElementById("reviewAnswersContainer");
    if (!container) return;

    container.innerHTML = "";

    q.answers.forEach((ans) => {
      const div = document.createElement("div");
      div.className = "answer-option";

      if (ans.isCorrect) {
        div.classList.add("correct");
        div.innerHTML = `
          <span class="answer-letter">${ans.letter}</span>
          <span class="answer-text">${ans.text}</span>
          <span class="answer-icon">✓</span>
        `;
      } else {
        div.innerHTML = `
          <span class="answer-letter">${ans.letter}</span>
          <span class="answer-text">${ans.text}</span>
        `;
      }

      container.appendChild(div);
    });
  }

  // ============================================================================
  // Results
  // ============================================================================

  /**
   * Show results screen
   */
  async showResults(): Promise<void> {
    this.hideAllScreens();
    const resultsScreen = document.getElementById("resultsScreen");
    if (resultsScreen) {
      resultsScreen.classList.remove("hidden");
    }

    let correct = 0;
    const total = this.currentQuestions.length;

    // Calculate score based on this session
    Object.keys(this.userAnswers).forEach((idx) => {
      const q = this.currentQuestions[Number(idx)];
      const ansIdx = this.userAnswers[Number(idx)];
      if (q?.answers[ansIdx]?.isCorrect) {
        correct++;
      }
    });

    const pct = total > 0 ? Math.round((100 * correct) / total) : 0;
    const T = this.config.getTranslations();

    // Update score circle
    const scoreCircle = document.getElementById("scoreCircle");
    const scoreEl = document.getElementById("finalScore");
    if (scoreEl) {
      scoreEl.textContent = `${pct}%`;
    }

    if (scoreCircle) {
      scoreCircle.className = `score-circle ${pct >= 70 ? "good" : pct >= 50 ? "medium" : "bad"}`;
      scoreCircle.style.setProperty("--score-percent", `${pct}%`);
    }

    const scoreDetails = document.getElementById("scoreDetails");
    if (scoreDetails) {
      scoreDetails.textContent = `${correct} ${T.correctOutOf} ${total}`;
    }

    // Save score and update comparison
    if (this.examData) {
      const scoreData = await this.config.saveScore(this.examData.exam_id, pct);
      this.updateScoreComparison(scoreData);

      // Increment attempt counter
      await this.config.incrementAttempt(this.examData.exam_id);
    }

    // Review Summary
    const summary = document.getElementById("reviewSummary");
    if (!summary) return;

    summary.innerHTML = "";

    this.currentQuestions.forEach((q, i) => {
      const div = document.createElement("div");
      div.className = "review-item";
      div.textContent = String(q.number);

      // Status in this session
      if (this.userAnswers[i] !== undefined) {
        const isCorr = q.answers[this.userAnswers[i]]?.isCorrect ?? false;
        div.classList.add(isCorr ? "correct" : "incorrect");
      } else {
        div.classList.add("unanswered");
      }

      div.onclick = () => {
        this.startReview();
        const reviewIdx = this.filteredQuestions.findIndex((fq) => fq.number === q.number);
        if (reviewIdx !== -1) {
          this.currentIndex = reviewIdx;
          this.renderReviewQuestion();
        }
      };

      summary.appendChild(div);
    });
  }

  /**
   * Update score comparison display
   */
  private updateScoreComparison(scoreData: { lastScore: number | null; bestScore: number | null }): void {
    const lastScoreEl = document.getElementById("lastScoreValue");
    const bestScoreEl = document.getElementById("bestScoreValue");
    const T = this.config.getTranslations();

    if (lastScoreEl) {
      lastScoreEl.textContent = scoreData.lastScore !== null && scoreData.lastScore !== undefined
        ? `${scoreData.lastScore}%`
        : (T.notAttempted ?? "-");
    }

    if (bestScoreEl) {
      bestScoreEl.textContent = scoreData.bestScore !== null && scoreData.bestScore !== undefined
        ? `${scoreData.bestScore}%`
        : (T.notAttempted ?? "-");
    }
  }

  // ============================================================================
  // Utility
  // ============================================================================

  /**
   * Hide all screen elements
   */
  private hideAllScreens(): void {
    document.querySelectorAll('[id$="Screen"]').forEach((el) => {
      el.classList.add("hidden");
    });
  }
}
