/**
 * ReviewView — Post-attempt review screen rendering.
 *
 * Renders review navigation, question details, and feedback.
 * All data is pre-computed; this module only does DOM manipulation.
 */

import type { Translations } from "../../i18n/index.js";
import type { QuestionResultView } from "../../application/viewState.js";
import {
  computeReviewNavigatorItems,
  renderReviewNavigator as renderNavGrid,
  type ReviewNavigatorItem,
  type QuestionResultState,
} from "../practice/buildQuestionNavigator.js";
import type { PracticeManager } from "../../modes/practice.js";

/**
 * Set translation labels on the review screen.
 */
export function initReviewLabels(T: Translations): void {
  const txtBackReview = document.getElementById("txtBackReview");
  if (txtBackReview)
    txtBackReview.textContent = T.reviewBack || T.back || "Back";
  const txtReviewPrev = document.getElementById("txtReviewPrevious");
  if (txtReviewPrev) txtReviewPrev.textContent = T.reviewPrev || "← Prev";
  const txtReviewNext = document.getElementById("txtReviewNext");
  if (txtReviewNext) txtReviewNext.textContent = T.reviewNext || "Next →";

  const txtNextWrong = document.getElementById("txtNextWrong");
  if (txtNextWrong)
    txtNextWrong.textContent = `❌ ${T.nextWrongQuestion || "Next Wrong"}`;
  const txtNextBlank = document.getElementById("txtNextBlank");
  if (txtNextBlank)
    txtNextBlank.textContent = `⬜ ${T.nextBlankQuestion || "Next Blank"}`;
}

/**
 * Show the review screen element.
 */
export function showReviewScreen(): void {
  const reviewScreen = document.getElementById("reviewScreen");
  if (reviewScreen) reviewScreen.classList.remove("hidden");
}

/**
 * Bind the filter buttons (All / Wrong only).
 */
export function bindReviewFilters(
  onFilterAll: () => void,
  onFilterWrong: () => void,
): void {
  const filterAll = document.getElementById("filterAll");
  const filterWrong = document.getElementById("filterWrong");

  if (filterAll) {
    filterAll.onclick = () => {
      filterAll.classList.add("active");
      filterWrong?.classList.remove("active");
      onFilterAll();
    };
  }

  if (filterWrong) {
    filterWrong.onclick = () => {
      filterWrong.classList.add("active");
      filterAll?.classList.remove("active");
      onFilterWrong();
    };
  }
}

/**
 * Render a single review question into the review screen.
 */
export function renderReviewQuestion(
  q: QuestionResultView,
  index: number,
  total: number,
  T: Translations,
  practiceManager: PracticeManager,
): void {
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
    progressText.textContent = `${index + 1}/${total}`;
  }

  const progressBar = document.getElementById("reviewProgressBar");
  if (progressBar) {
    const pct = total > 0 ? ((index + 1) / total) * 100 : 0;
    progressBar.style.width = `${pct}%`;
  }

  // Render feedback panel
  const reviewFeedback = document.getElementById("reviewFeedbackSection");
  if (reviewFeedback) {
    practiceManager.renderFeedbackPanel(reviewFeedback, q, T);
  }
}

/**
 * Display empty state when no questions match the filter.
 */
export function renderEmptyReviewState(
  filter: "all" | "wrong",
  T: Translations,
): void {
  const questionText = document.getElementById("reviewQuestionText");
  if (questionText) {
    questionText.textContent =
      filter === "wrong"
        ? T.noWrongAnswers || "No wrong answers to review"
        : T.noQuestionsMatch || "No questions match this filter!";
  }
}

/**
 * Build review navigator items from the question summary.
 */
export function buildReviewNavItems(
  questionSummary: QuestionResultView[],
  flaggedQuestions: ReadonlySet<number>,
  currentIndex: number,
): ReviewNavigatorItem[] {
  const results: QuestionResultState[] = questionSummary.map((q, i) => ({
    isCorrect: q.isCorrect,
    isBlank: q.isBlank,
    isFlagged: flaggedQuestions.has(i),
  }));

  return computeReviewNavigatorItems(results, currentIndex);
}

/**
 * Render the review navigator grid.
 */
export function renderReviewNavigator(
  questionSummary: QuestionResultView[],
  flaggedQuestions: ReadonlySet<number>,
  currentIndex: number,
  onJump: (index: number) => void,
): void {
  const container = document.getElementById("reviewMinimapContainer");
  if (!container) return;

  const results: QuestionResultState[] = questionSummary.map((q, i) => ({
    isCorrect: q.isCorrect,
    isBlank: q.isBlank,
    isFlagged: flaggedQuestions.has(i),
  }));

  const navItems = computeReviewNavigatorItems(results, currentIndex);

  renderNavGrid(container, navItems, onJump);
}

/**
 * Scroll the review question card into view.
 */
export function scrollQuestionIntoView(): void {
  const questionCard = document.querySelector("#reviewScreen .question-card");
  if (questionCard) {
    questionCard.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}
