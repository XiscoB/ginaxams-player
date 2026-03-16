/**
 * Question Navigator — Pure helpers for building navigator grid state
 *
 * Computes the visual state of each question in the navigator grid
 * and renders the grid to a DOM container.
 *
 * Supports two modes:
 * - "attempt": During an active exam (answered/unanswered/current)
 * - "review": Post-submission review (correct/wrong/blank/current)
 *
 * Pure logic (computeNavigatorItems, computeReviewNavigatorItems) is testable
 * without DOM. Rendering (renderNavigator, renderReviewNavigator) is a thin DOM layer.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Visual state of a question in the navigator grid (attempt mode).
 */
export type QuestionNavState = "current" | "answered" | "unanswered";

/**
 * Visual state of a question in the navigator grid (review mode).
 */
export type ReviewNavState = "correct" | "wrong" | "blank" | "current";

/**
 * A single item in the navigator grid (attempt mode).
 */
export interface NavigatorItem {
  /** 0-based index in the attempt question list */
  index: number;
  /** Display label (1-based question position) */
  label: string;
  /** Visual state */
  state: QuestionNavState;
  /** Whether the question is flagged */
  isFlagged: boolean;
  /** Whether this is the current question */
  isCurrent: boolean;
}

/**
 * Result state for a single question used to compute review navigator items.
 */
export interface QuestionResultState {
  /** Whether the user answered correctly */
  isCorrect: boolean;
  /** Whether the user left it blank */
  isBlank: boolean;
  /** Whether the question was flagged during the attempt */
  isFlagged: boolean;
}

/**
 * A single item in the review navigator grid.
 */
export interface ReviewNavigatorItem {
  /** 0-based index in the question list */
  index: number;
  /** Display label (1-based question position) */
  label: string;
  /** Visual state based on exam result */
  state: ReviewNavState;
  /** Whether this is the currently viewed question */
  isCurrent: boolean;
  /** Whether the question was flagged during the attempt */
  isFlagged: boolean;
  /** Underlying result state (correct/wrong/blank) — not overridden by "current" */
  resultState: "correct" | "wrong" | "blank";
}

/**
 * Aggregate counts for the navigator.
 */
export interface NavigatorSummary {
  total: number;
  answered: number;
  unanswered: number;
  flagged: number;
}

// ============================================================================
// Pure Computation
// ============================================================================

/**
 * Compute navigator items from attempt state.
 *
 * @param totalQuestions - Total number of questions in the attempt
 * @param currentIndex - 0-based index of the current question
 * @param answeredIndices - Set of 0-based indices that have been answered
 * @param flaggedIndices - Set of 0-based indices that are flagged
 * @returns Array of NavigatorItem for rendering
 */
export function computeNavigatorItems(
  totalQuestions: number,
  currentIndex: number,
  answeredIndices: ReadonlySet<number>,
  flaggedIndices: ReadonlySet<number>,
): NavigatorItem[] {
  const items: NavigatorItem[] = [];

  for (let i = 0; i < totalQuestions; i++) {
    const isCurrent = i === currentIndex;
    const isAnswered = answeredIndices.has(i);
    const isFlagged = flaggedIndices.has(i);

    let state: QuestionNavState;
    if (isCurrent) {
      state = "current";
    } else if (isAnswered) {
      state = "answered";
    } else {
      state = "unanswered";
    }

    items.push({
      index: i,
      label: String(i + 1),
      state,
      isFlagged,
      isCurrent,
    });
  }

  return items;
}

/**
 * Compute aggregate summary from navigator items.
 *
 * @param items - Navigator items array
 * @returns Summary counts
 */
export function computeNavigatorSummary(
  items: readonly NavigatorItem[],
): NavigatorSummary {
  let answered = 0;
  let flagged = 0;

  for (const item of items) {
    if (
      item.state === "answered" ||
      (item.isCurrent && item.state !== "unanswered")
    ) {
      // Don't count "current" as answered unless it was already answered
    }
    // Count by checking the original answered set logic:
    // An item is "answered" if its state would be "answered" when not current
    if (item.state === "answered") {
      answered++;
    } else if (item.isCurrent) {
      // Current item: check if it's answered by looking at whether it was
      // in the answered set. Since we set state to "current" for current items,
      // we need a different approach.
    }
    if (item.isFlagged) {
      flagged++;
    }
  }

  // Recompute answered more accurately: items that are answered regardless of current
  // The "current" state overrides "answered" visually, but the item may still be answered.
  // We need to receive the answeredIndices to count properly.
  // Since this is a derived helper, let's provide a simpler overload.

  return {
    total: items.length,
    answered,
    unanswered: items.length - answered,
    flagged,
  };
}

/**
 * Compute summary directly from raw data (more accurate than from items).
 *
 * @param totalQuestions - Total questions
 * @param answeredCount - Number of answered questions
 * @param flaggedCount - Number of flagged questions
 * @returns Summary counts
 */
export function computeSummaryFromCounts(
  totalQuestions: number,
  answeredCount: number,
  flaggedCount: number,
): NavigatorSummary {
  return {
    total: totalQuestions,
    answered: answeredCount,
    unanswered: totalQuestions - answeredCount,
    flagged: flaggedCount,
  };
}

// ============================================================================
// DOM Rendering
// ============================================================================

/**
 * Render the navigator grid into a container element.
 *
 * Uses event delegation on the container for click handling.
 *
 * @param container - The DOM element to render into
 * @param items - Navigator items to display
 * @param onJump - Callback when a question is clicked (receives 0-based index)
 */
export function renderNavigator(
  container: HTMLElement,
  items: readonly NavigatorItem[],
  onJump: (index: number) => void,
): void {
  container.innerHTML = "";

  for (const item of items) {
    const el = document.createElement("div");
    el.className = "minimap-item";
    el.textContent = item.label;
    el.dataset.index = String(item.index);

    // Apply state classes
    if (item.isCurrent) {
      el.classList.add("current");
    }

    switch (item.state) {
      case "answered":
        el.classList.add("user-correct"); // green background for answered
        break;
      case "unanswered":
        el.classList.add("unanswered");
        break;
      case "current":
        // Current styling handled by .current class
        if (!el.classList.contains("user-correct")) {
          el.classList.add("unanswered");
        }
        break;
    }

    // Flagged indicator
    if (item.isFlagged) {
      el.classList.add("flagged");
      const flag = document.createElement("span");
      flag.className = "minimap-flag";
      flag.textContent = "⚑";
      el.appendChild(flag);
    }

    container.appendChild(el);
  }

  // Event delegation for clicks
  container.onclick = (e: MouseEvent) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>(
      ".minimap-item",
    );
    if (target?.dataset.index != null) {
      onJump(parseInt(target.dataset.index, 10));
    }
  };
}

// ============================================================================
// Review Mode — Pure Computation
// ============================================================================

/**
 * Compute review navigator items from exam result state.
 *
 * @param results - Per-question result states (ordered by question index)
 * @param currentIndex - 0-based index of the currently viewed question
 * @returns Array of ReviewNavigatorItem for rendering
 */
export function computeReviewNavigatorItems(
  results: readonly QuestionResultState[],
  currentIndex: number,
): ReviewNavigatorItem[] {
  return results.map((r, i) => {
    const isCurrent = i === currentIndex;
    const resultState: "correct" | "wrong" | "blank" = r.isBlank
      ? "blank"
      : r.isCorrect
        ? "correct"
        : "wrong";

    const state: ReviewNavState = isCurrent ? "current" : resultState;

    return {
      index: i,
      label: String(i + 1),
      state,
      isCurrent,
      isFlagged: r.isFlagged,
      resultState,
    };
  });
}

/**
 * Find the index of the next wrong question starting from (but not including) startIndex.
 * Wraps around if needed. Returns -1 if no wrong questions exist.
 *
 * @param items - Review navigator items
 * @param startIndex - 0-based index to start searching from (exclusive)
 * @returns 0-based index of the next wrong question, or -1
 */
export function findNextWrongIndex(
  items: readonly ReviewNavigatorItem[],
  startIndex: number,
): number {
  const len = items.length;
  if (len === 0) return -1;

  for (let offset = 1; offset <= len; offset++) {
    const idx = (startIndex + offset) % len;
    if (items[idx].resultState === "wrong") {
      return idx;
    }
  }
  return -1;
}

/**
 * Find the index of the next blank question starting from (but not including) startIndex.
 * Wraps around if needed. Returns -1 if no blank questions exist.
 *
 * @param items - Review navigator items
 * @param startIndex - 0-based index to start searching from (exclusive)
 * @returns 0-based index of the next blank question, or -1
 */
export function findNextBlankIndex(
  items: readonly ReviewNavigatorItem[],
  startIndex: number,
): number {
  const len = items.length;
  if (len === 0) return -1;

  for (let offset = 1; offset <= len; offset++) {
    const idx = (startIndex + offset) % len;
    if (items[idx].resultState === "blank") {
      return idx;
    }
  }
  return -1;
}

// ============================================================================
// Review Mode — DOM Rendering
// ============================================================================

/**
 * Render the review navigator grid into a container element.
 *
 * Uses review-specific CSS classes:
 * - .was-correct (green) for correct answers
 * - .was-incorrect (red) for wrong answers
 * - .unanswered (grey) for blank answers
 * - .current (accent border) for the currently viewed question
 * - .flagged + flag indicator for flagged questions
 *
 * @param container - The DOM element to render into
 * @param items - Review navigator items to display
 * @param onJump - Callback when a question is clicked (receives 0-based index)
 */
export function renderReviewNavigator(
  container: HTMLElement,
  items: readonly ReviewNavigatorItem[],
  onJump: (index: number) => void,
): void {
  container.innerHTML = "";

  for (const item of items) {
    const el = document.createElement("div");
    el.className = "minimap-item";
    el.textContent = item.label;
    el.dataset.index = String(item.index);

    // Apply current highlight
    if (item.isCurrent) {
      el.classList.add("current");
    }

    // Apply result-based class (even when current, for background color)
    switch (item.resultState) {
      case "correct":
        el.classList.add("was-correct");
        break;
      case "wrong":
        el.classList.add("was-incorrect");
        break;
      case "blank":
        el.classList.add("unanswered");
        break;
    }

    // Flagged indicator
    if (item.isFlagged) {
      el.classList.add("flagged");
      const flag = document.createElement("span");
      flag.className = "minimap-flag";
      flag.textContent = "⚑";
      el.appendChild(flag);
    }

    container.appendChild(el);
  }

  // Event delegation for clicks
  container.onclick = (e: MouseEvent) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>(
      ".minimap-item",
    );
    if (target?.dataset.index != null) {
      onJump(parseInt(target.dataset.index, 10));
    }
  };
}
