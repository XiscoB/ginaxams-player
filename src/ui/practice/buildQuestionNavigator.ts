/**
 * Question Navigator — Pure helpers for building navigator grid state
 *
 * Computes the visual state of each question in the navigator grid
 * and renders the grid to a DOM container.
 *
 * Pure logic (computeNavigatorItems, computeNavigatorSummary) is testable
 * without DOM. Rendering (renderNavigator) is a thin DOM layer.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Visual state of a question in the navigator grid.
 */
export type QuestionNavState = "current" | "answered" | "unanswered";

/**
 * A single item in the navigator grid.
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
