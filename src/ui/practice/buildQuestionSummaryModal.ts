/**
 * Question Summary Modal — End-of-exam summary before submission
 *
 * Displays answered/unanswered/flagged counts and an integrated
 * navigator grid so users can review before submitting.
 *
 * Pure data computation is testable without DOM.
 * Rendering creates a modal overlay element.
 */

import type { Translations } from "../../i18n/index.js";
import type { NavigatorItem } from "./buildQuestionNavigator.js";
import { renderNavigator } from "./buildQuestionNavigator.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Data for the summary modal display.
 */
export interface SummaryModalData {
  answered: number;
  unanswered: number;
  flagged: number;
  total: number;
}

/**
 * Callbacks for summary modal actions.
 */
export interface SummaryModalCallbacks {
  onJump: (index: number) => void;
  onSubmit: () => void;
  onReturn: () => void;
}

// ============================================================================
// Pure Computation
// ============================================================================

/**
 * Compute summary modal data from attempt state.
 *
 * @param totalQuestions - Total questions in the attempt
 * @param answeredCount - Number of answered questions
 * @param flaggedCount - Number of flagged questions
 * @returns Summary data for display
 */
export function computeSummaryData(
  totalQuestions: number,
  answeredCount: number,
  flaggedCount: number,
): SummaryModalData {
  return {
    answered: answeredCount,
    unanswered: totalQuestions - answeredCount,
    flagged: flaggedCount,
    total: totalQuestions,
  };
}

/**
 * Find the first unanswered question index.
 *
 * @param items - Navigator items
 * @returns 0-based index of first unanswered question, or -1 if all answered
 */
export function findFirstUnanswered(items: readonly NavigatorItem[]): number {
  for (const item of items) {
    if (item.state === "unanswered" && !item.isCurrent) {
      return item.index;
    }
  }
  // Also check current item if it's unanswered
  for (const item of items) {
    if (
      item.state === "unanswered" ||
      (item.isCurrent && item.state === "current")
    ) {
      return item.index;
    }
  }
  return -1;
}

/**
 * Find the first flagged question index.
 *
 * @param items - Navigator items
 * @returns 0-based index of first flagged question, or -1 if none flagged
 */
export function findFirstFlagged(items: readonly NavigatorItem[]): number {
  for (const item of items) {
    if (item.isFlagged) {
      return item.index;
    }
  }
  return -1;
}

// ============================================================================
// DOM Rendering
// ============================================================================

/**
 * Create and display the summary modal.
 *
 * @param data - Summary counts
 * @param navigatorItems - Navigator items for the embedded grid
 * @param callbacks - Action callbacks
 * @param T - Translations
 * @returns The modal overlay element (already appended to body)
 */
export function renderSummaryModal(
  data: SummaryModalData,
  navigatorItems: readonly NavigatorItem[],
  callbacks: SummaryModalCallbacks,
  T: Translations,
): HTMLElement {
  // Remove any existing modal
  const existing = document.getElementById("examSummaryModal");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "examSummaryModal";
  overlay.className = "summary-modal-overlay";

  const modal = document.createElement("div");
  modal.className = "summary-modal";

  // Header
  const header = document.createElement("h2");
  header.className = "summary-modal__title";
  header.textContent = T.examSummary || "Exam Summary";
  modal.appendChild(header);

  // Stats grid
  const stats = document.createElement("div");
  stats.className = "summary-modal__stats";
  stats.innerHTML = `
    <div class="summary-stat summary-stat--answered">
      <span class="summary-stat__value">${data.answered}</span>
      <span class="summary-stat__label">${T.answered || "Answered"}</span>
    </div>
    <div class="summary-stat summary-stat--unanswered">
      <span class="summary-stat__value">${data.unanswered}</span>
      <span class="summary-stat__label">${T.unanswered || "Unanswered"}</span>
    </div>
    <div class="summary-stat summary-stat--flagged">
      <span class="summary-stat__value">${data.flagged}</span>
      <span class="summary-stat__label">${T.flagged || "Flagged"}</span>
    </div>
  `;
  modal.appendChild(stats);

  // Quick jump buttons
  const quickJumps = document.createElement("div");
  quickJumps.className = "summary-modal__quick-jumps";

  if (data.unanswered > 0) {
    const jumpUnanswered = document.createElement("button");
    jumpUnanswered.className = "btn btn--secondary summary-modal__jump-btn";
    jumpUnanswered.textContent = T.jumpToUnanswered || "Jump to Unanswered";
    jumpUnanswered.addEventListener("click", () => {
      const idx = findFirstUnanswered(navigatorItems);
      if (idx >= 0) {
        callbacks.onJump(idx);
        closeSummaryModal();
      }
    });
    quickJumps.appendChild(jumpUnanswered);
  }

  if (data.flagged > 0) {
    const jumpFlagged = document.createElement("button");
    jumpFlagged.className = "btn btn--secondary summary-modal__jump-btn";
    jumpFlagged.textContent = T.jumpToFlagged || "Jump to Flagged";
    jumpFlagged.addEventListener("click", () => {
      const idx = findFirstFlagged(navigatorItems);
      if (idx >= 0) {
        callbacks.onJump(idx);
        closeSummaryModal();
      }
    });
    quickJumps.appendChild(jumpFlagged);
  }

  if (quickJumps.children.length > 0) {
    modal.appendChild(quickJumps);
  }

  // Navigator grid label
  const navLabel = document.createElement("h3");
  navLabel.className = "summary-modal__nav-label";
  navLabel.textContent = T.navigator || "Navigator";
  modal.appendChild(navLabel);

  // Navigator grid
  const navContainer = document.createElement("div");
  navContainer.className = "question-minimap summary-modal__navigator";
  renderNavigator(navContainer, navigatorItems, (index) => {
    callbacks.onJump(index);
    closeSummaryModal();
  });
  modal.appendChild(navContainer);

  // Action buttons
  const actions = document.createElement("div");
  actions.className = "summary-modal__actions";

  const returnBtn = document.createElement("button");
  returnBtn.className = "btn btn--secondary";
  returnBtn.textContent = T.returnToQuestions || "Return to Questions";
  returnBtn.addEventListener("click", () => {
    callbacks.onReturn();
    closeSummaryModal();
  });

  const submitBtn = document.createElement("button");
  submitBtn.className = "btn btn--primary";
  submitBtn.textContent = T.submitExam || "Submit Exam";
  submitBtn.addEventListener("click", () => {
    closeSummaryModal();
    callbacks.onSubmit();
  });

  actions.appendChild(returnBtn);
  actions.appendChild(submitBtn);
  modal.appendChild(actions);

  overlay.appendChild(modal);

  // Close on overlay click
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      callbacks.onReturn();
      closeSummaryModal();
    }
  });

  document.body.appendChild(overlay);
  return overlay;
}

/**
 * Close and remove the summary modal from the DOM.
 */
export function closeSummaryModal(): void {
  const modal = document.getElementById("examSummaryModal");
  if (modal) modal.remove();
}
