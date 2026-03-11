/**
 * ResultsView — Results screen rendering helpers.
 *
 * Binds results action buttons and renders score comparison.
 * The actual results content is rendered by PracticeManager.
 *
 * Pure DOM manipulation — no business logic.
 */

import type { Translations } from "../../i18n/index.js";

export interface ExamScoreStats {
  lastScore?: number;
  bestScore?: number;
}

export interface ResultsCallbacks {
  onTryAgain: () => void;
  onReviewAnswers: () => void;
}

/**
 * Show the results screen.
 */
export function showResultsScreen(): void {
  const resultsScreen = document.getElementById("resultsScreen");
  if (resultsScreen) resultsScreen.classList.remove("hidden");
}

/**
 * Bind the try again and review answers buttons.
 */
export function bindResultsActions(callbacks: ResultsCallbacks): void {
  const btnTryAgain = document.getElementById("btnTryAgain");
  if (btnTryAgain) btnTryAgain.onclick = callbacks.onTryAgain;

  const btnReviewAnswers = document.getElementById("btnReviewAnswers");
  if (btnReviewAnswers) btnReviewAnswers.onclick = callbacks.onReviewAnswers;
}

/**
 * Render last/best score comparison in the results screen.
 */
export function renderScoreComparison(
  stats: ExamScoreStats | undefined,
  T: Translations,
): void {
  const lastScoreEl = document.getElementById("lastScoreValue");
  const bestScoreEl = document.getElementById("bestScoreValue");
  if (!lastScoreEl || !bestScoreEl) return;

  if (stats) {
    lastScoreEl.textContent =
      stats.lastScore !== undefined
        ? `${stats.lastScore}%`
        : T.notAttempted || "-";
    bestScoreEl.textContent =
      stats.bestScore !== undefined
        ? `${stats.bestScore}%`
        : T.notAttempted || "-";
  } else {
    lastScoreEl.textContent = T.notAttempted || "-";
    bestScoreEl.textContent = T.notAttempted || "-";
  }
}
