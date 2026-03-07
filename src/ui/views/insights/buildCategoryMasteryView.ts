/**
 * Category Mastery View Builder — Insights Phase 12
 *
 * Renders the Category Mastery dashboard card with:
 * - Sorted mastery list (weakest first)
 * - Color-coded mastery badges (weak=red, learning=orange, mastered=green)
 * - Accuracy bar and question count per category
 * - Click-to-drill-down into category questions
 *
 * No domain imports — uses enriched InsightsViewData only.
 */

import type {
  InsightsViewData,
  InsightsQuestionData,
} from "../../../application/viewState.js";
import type { CategoryMastery, MasteryLevel } from "../../../domain/types.js";
import type { BadgeVariant } from "../../components/Badge.js";
import type { Translations } from "../../../i18n/index.js";

import { createCard } from "../../components/Card.js";
import { createList } from "../../components/List.js";
import { createBadge } from "../../components/Badge.js";
import { createProgressBar } from "../../components/ProgressBar.js";

import {
  countQuestionsPerCategory,
  filterByCategory,
  truncateText,
  translateTrapLevel,
} from "./insightsHelpers.js";

// ============================================================================
// Main Builder
// ============================================================================

/**
 * Build the Category Mastery card with drill-down support.
 *
 * @param data - Full insights data
 * @param T - Optional translations for i18n
 * @returns Card HTMLElement with interactive category list
 */
export function buildCategoryMasteryView(
  data: InsightsViewData,
  T?: Translations,
): HTMLElement {
  const questionCounts = countQuestionsPerCategory(data.questions);
  const title = T?.insightsCategoryMastery ?? "Category Mastery";

  if (data.categoryMastery.length === 0) {
    const empty = document.createElement("p");
    empty.textContent =
      T?.insightsCategoryMasteryEmpty ??
      "No category data available. Import exams to see mastery levels.";
    empty.style.color = "var(--text-secondary)";
    empty.style.fontSize = "0.875rem";
    return createCard({ title, content: empty });
  }

  const container = document.createElement("div");

  const list = createList(data.categoryMastery, (cat) => {
    const row = buildCategoryRow(cat, questionCounts.get(cat.category) ?? 0, T);

    // Drill-down: click to toggle question list
    row.style.cursor = "pointer";
    row.addEventListener("click", () => {
      const existing = row.nextElementSibling;
      if (existing?.classList.contains("gx-insights-drilldown")) {
        existing.remove();
        return;
      }

      const drillDown = buildDrillDown(
        filterByCategory(data.questions, cat.category),
        T,
      );

      row.after(drillDown);
    });

    return row;
  });

  container.appendChild(list);

  return createCard({ title, content: container });
}

// ============================================================================
// Row Builders
// ============================================================================

function buildCategoryRow(
  cat: CategoryMastery,
  questionCount: number,
  T?: Translations,
): HTMLElement {
  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.flexDirection = "column";
  row.style.gap = "4px";
  row.style.padding = "8px 0";

  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.alignItems = "center";
  header.style.justifyContent = "space-between";
  header.style.gap = "8px";

  const name = document.createElement("span");
  name.textContent = cat.category;
  name.style.fontWeight = "600";
  name.style.fontSize = "0.875rem";
  name.style.color = "var(--text-primary)";
  name.style.flex = "1";

  const badge = createBadge(
    translateMastery(cat.level, T),
    masteryBadgeVariant(cat.level),
  );

  header.appendChild(name);
  header.appendChild(badge);

  const statsRow = document.createElement("div");
  statsRow.style.display = "flex";
  statsRow.style.alignItems = "center";
  statsRow.style.gap = "12px";
  statsRow.style.fontSize = "0.8rem";
  statsRow.style.color = "var(--text-secondary)";

  const accuracyLabel = document.createElement("span");
  accuracyLabel.textContent = `${T?.insightsAccuracy ?? "Accuracy"}: ${Math.round(cat.accuracy * 100)}%`;

  const countLabel = document.createElement("span");
  countLabel.textContent = `${T?.insightsQuestions ?? "Questions"}: ${questionCount}`;

  const barContainer = document.createElement("div");
  barContainer.style.flex = "1";
  barContainer.style.maxWidth = "100px";
  const percent = Math.round(cat.accuracy * 100);
  barContainer.appendChild(
    createProgressBar({
      percent,
      variant: percent >= 70 ? "success" : percent >= 40 ? "warning" : "danger",
    }),
  );

  statsRow.appendChild(accuracyLabel);
  statsRow.appendChild(barContainer);
  statsRow.appendChild(countLabel);

  row.appendChild(header);
  row.appendChild(statsRow);

  return row;
}

// ============================================================================
// Drill-Down Panel
// ============================================================================

function buildDrillDown(
  questions: InsightsQuestionData[],
  T?: Translations,
): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "gx-insights-drilldown";
  panel.style.paddingLeft = "16px";
  panel.style.borderLeft =
    "2px solid var(--border-color, rgba(255,255,255,0.1))";
  panel.style.marginBottom = "8px";

  if (questions.length === 0) {
    const empty = document.createElement("p");
    empty.textContent =
      T?.insightsNoCategoryQuestions ?? "No questions in this category.";
    empty.style.color = "var(--text-secondary)";
    empty.style.fontSize = "0.8rem";
    panel.appendChild(empty);
    return panel;
  }

  // Sort by weakness descending
  const sorted = [...questions].sort(
    (a, b) => b.weaknessScore - a.weaknessScore,
  );

  const list = createList(sorted, (q) => {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "8px";
    row.style.padding = "4px 0";
    row.style.fontSize = "0.8rem";

    const num = document.createElement("span");
    num.textContent = `${T?.questionPrefix ?? "Q"}${q.questionNumber}`;
    num.style.fontWeight = "600";
    num.style.color = "var(--text-primary)";
    num.style.minWidth = "3ch";

    const weakLabel = document.createElement("span");
    weakLabel.textContent = `${T?.weaknessPrefix ?? "W"}: ${q.weaknessScore.toFixed(1)}`;
    weakLabel.style.color = "var(--text-secondary)";

    const diffBadge = createBadge(
      translateDifficulty(q.difficultyLevel, T),
      difficultyBadgeVariant(q.difficultyLevel),
    );

    const preview = document.createElement("span");
    preview.textContent = truncateText(q.questionText, 50);
    preview.style.color = "var(--text-secondary)";
    preview.style.flex = "1";
    preview.style.overflow = "hidden";
    preview.style.textOverflow = "ellipsis";
    preview.style.whiteSpace = "nowrap";

    row.appendChild(num);
    row.appendChild(weakLabel);
    row.appendChild(diffBadge);

    if (q.trapLevel !== "none") {
      row.appendChild(
        createBadge(
          `${T?.trapPrefix ?? "trap"}: ${translateTrapLevel(q.trapLevel, T)}`,
          "danger",
        ),
      );
    }

    row.appendChild(preview);
    return row;
  });

  panel.appendChild(list);
  return panel;
}

// ============================================================================
// Helpers
// ============================================================================

function translateMastery(level: MasteryLevel, T?: Translations): string {
  switch (level) {
    case "weak":
      return T?.masteryWeak ?? "weak";
    case "learning":
      return T?.masteryLearning ?? "learning";
    case "mastered":
      return T?.masteryMastered ?? "mastered";
  }
}

function translateDifficulty(
  level: "easy" | "medium" | "hard",
  T?: Translations,
): string {
  switch (level) {
    case "easy":
      return T?.insightsDifficultyEasy ?? "Easy";
    case "medium":
      return T?.insightsDifficultyMedium ?? "Medium";
    case "hard":
      return T?.insightsDifficultyHard ?? "Hard";
  }
}

function masteryBadgeVariant(level: MasteryLevel): BadgeVariant {
  switch (level) {
    case "weak":
      return "danger";
    case "learning":
      return "warning";
    case "mastered":
      return "success";
  }
}

function difficultyBadgeVariant(
  level: "easy" | "medium" | "hard",
): BadgeVariant {
  switch (level) {
    case "easy":
      return "success";
    case "medium":
      return "warning";
    case "hard":
      return "danger";
  }
}
