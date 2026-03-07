/**
 * Difficulty Distribution View Builder — Insights Phase 12
 *
 * Renders the Difficulty Distribution card with:
 * - Horizontal bars for easy/medium/hard
 * - Percentage values
 * - Optional click-to-filter by difficulty
 *
 * No domain imports — uses enriched InsightsViewData only.
 */

import type {
  InsightsViewData,
  InsightsQuestionData,
} from "../../../application/viewState.js";

import { createCard } from "../../components/Card.js";
import { createStack } from "../../components/Stack.js";
import { createList } from "../../components/List.js";
import { createProgressBar } from "../../components/ProgressBar.js";
import { createBadge } from "../../components/Badge.js";

import {
  computeDifficultyPercentages,
  truncateText,
} from "./insightsHelpers.js";

// ============================================================================
// Main Builder
// ============================================================================

/**
 * Build the Difficulty Distribution card.
 *
 * @param data - Full insights data
 * @returns Card HTMLElement
 */
export function buildDifficultyDistributionView(
  data: InsightsViewData,
): HTMLElement {
  const dist = data.difficultyDistribution;
  const pct = computeDifficultyPercentages(dist);

  const container = document.createElement("div");

  // Distribution bars
  const bars = buildDistributionBars(dist, pct);
  container.appendChild(bars);

  // Drill-down container for filtered questions
  const drillDown = document.createElement("div");
  drillDown.style.marginTop = "12px";
  container.appendChild(drillDown);

  // Make bars clickable to filter
  const barRows = bars.querySelectorAll("[data-difficulty]");
  barRows.forEach((barRow) => {
    (barRow as HTMLElement).style.cursor = "pointer";
    barRow.addEventListener("click", () => {
      const level = (barRow as HTMLElement).dataset.difficulty as
        | "easy"
        | "medium"
        | "hard";

      // Toggle: if already showing this level, hide
      if (drillDown.dataset.active === level) {
        drillDown.innerHTML = "";
        drillDown.dataset.active = "";
        return;
      }

      drillDown.dataset.active = level;
      const filtered = data.questions.filter(
        (q) => q.difficultyLevel === level,
      );
      renderDifficultyDrillDown(drillDown, filtered, level);
    });
  });

  return createCard({ title: "Difficulty Distribution", content: container });
}

// ============================================================================
// Distribution Bars
// ============================================================================

function buildDistributionBars(
  dist: { easy: number; medium: number; hard: number; total: number },
  pct: { easy: number; medium: number; hard: number },
): HTMLElement {
  const levels: Array<{
    key: "easy" | "medium" | "hard";
    label: string;
    count: number;
    percent: number;
    variant: "success" | "warning" | "danger";
  }> = [
    {
      key: "easy",
      label: "Easy",
      count: dist.easy,
      percent: pct.easy,
      variant: "success",
    },
    {
      key: "medium",
      label: "Medium",
      count: dist.medium,
      percent: pct.medium,
      variant: "warning",
    },
    {
      key: "hard",
      label: "Hard",
      count: dist.hard,
      percent: pct.hard,
      variant: "danger",
    },
  ];

  const rows: HTMLElement[] = levels.map((lvl) => {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "12px";
    row.style.padding = "6px 0";
    row.dataset.difficulty = lvl.key;

    const label = document.createElement("span");
    label.textContent = lvl.label;
    label.style.minWidth = "60px";
    label.style.fontSize = "0.875rem";
    label.style.color = "var(--text-primary)";
    label.style.fontWeight = "500";

    const barContainer = document.createElement("div");
    barContainer.style.flex = "1";
    barContainer.appendChild(
      createProgressBar({ percent: lvl.percent, variant: lvl.variant }),
    );

    const valueEl = document.createElement("span");
    valueEl.textContent = `${lvl.percent}%`;
    valueEl.style.fontSize = "0.875rem";
    valueEl.style.fontWeight = "600";
    valueEl.style.color = "var(--text-primary)";
    valueEl.style.minWidth = "4ch";
    valueEl.style.textAlign = "right";

    const countEl = document.createElement("span");
    countEl.textContent = `(${lvl.count})`;
    countEl.style.fontSize = "0.8rem";
    countEl.style.color = "var(--text-secondary)";

    row.appendChild(label);
    row.appendChild(barContainer);
    row.appendChild(valueEl);
    row.appendChild(countEl);

    return row;
  });

  // Total summary
  const totalRow = document.createElement("div");
  totalRow.style.fontSize = "0.8rem";
  totalRow.style.color = "var(--text-secondary)";
  totalRow.style.marginTop = "4px";
  totalRow.textContent = `Total questions: ${dist.total}`;

  return createStack({
    direction: "column",
    gap: 4,
    children: [...rows, totalRow],
  });
}

// ============================================================================
// Difficulty Drill-Down
// ============================================================================

function renderDifficultyDrillDown(
  container: HTMLElement,
  questions: InsightsQuestionData[],
  level: string,
): void {
  container.innerHTML = "";

  if (questions.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = `No ${level} questions.`;
    empty.style.color = "var(--text-secondary)";
    empty.style.fontSize = "0.875rem";
    container.appendChild(empty);
    return;
  }

  const title = document.createElement("div");
  title.textContent = `${level.charAt(0).toUpperCase() + level.slice(1)} Questions (${questions.length})`;
  title.style.fontWeight = "600";
  title.style.fontSize = "0.875rem";
  title.style.color = "var(--text-primary)";
  title.style.marginBottom = "8px";
  container.appendChild(title);

  const sorted = [...questions].sort(
    (a, b) => b.weaknessScore - a.weaknessScore,
  );

  const list = createList(sorted.slice(0, 15), (q) => {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "8px";
    row.style.fontSize = "0.8rem";

    const num = document.createElement("span");
    num.textContent = `Q${q.questionNumber}`;
    num.style.fontWeight = "600";
    num.style.color = "var(--text-primary)";

    const preview = document.createElement("span");
    preview.textContent = truncateText(q.questionText, 60);
    preview.style.flex = "1";
    preview.style.color = "var(--text-secondary)";
    preview.style.overflow = "hidden";
    preview.style.textOverflow = "ellipsis";
    preview.style.whiteSpace = "nowrap";

    const weakLabel = document.createElement("span");
    weakLabel.textContent = `W: ${q.weaknessScore.toFixed(1)}`;
    weakLabel.style.color = "var(--text-secondary)";

    row.appendChild(num);
    row.appendChild(preview);
    row.appendChild(weakLabel);

    if (q.trapLevel !== "none") {
      row.appendChild(createBadge("trap", "danger"));
    }

    return row;
  });

  container.appendChild(list);
}
