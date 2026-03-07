/**
 * Weak Questions View Builder — Insights Phase 12
 *
 * Renders the Weak Questions card with:
 * - Questions sorted by weakness score descending
 * - Difficulty and trap badges
 * - Expandable feedback panels
 * - Category filter dropdown
 *
 * No domain imports — uses enriched InsightsViewData only.
 */

import type {
  InsightsViewData,
  InsightsQuestionData,
} from "../../../application/viewState.js";
import type { BadgeVariant } from "../../components/Badge.js";
import type { Translations } from "../../../i18n/index.js";

import { createCard } from "../../components/Card.js";
import { createList } from "../../components/List.js";
import { createBadge } from "../../components/Badge.js";

import {
  getWeakQuestionsSorted,
  filterByCategory,
  truncateText,
} from "./insightsHelpers.js";

// ============================================================================
// Main Builder
// ============================================================================

/**
 * Build the Weak Questions card with expandable feedback and category filter.
 *
 * @param data - Full insights data
 * @returns Card HTMLElement
 */
export function buildWeakQuestionsView(
  data: InsightsViewData,
  T?: Translations,
): HTMLElement {
  const allWeak = getWeakQuestionsSorted(data.questions);

  // Collect unique categories for filter
  const categories = new Set<string>();
  for (const q of data.questions) {
    for (const c of q.categories) {
      categories.add(c);
    }
  }

  const container = document.createElement("div");

  // Category filter
  if (categories.size > 1) {
    const filter = buildCategoryFilter(
      Array.from(categories).sort(),
      (selected) => {
        renderWeakList(
          listContainer,
          selected ? filterByCategory(allWeak, selected) : allWeak,
          T,
        );
      },
      T,
    );
    container.appendChild(filter);
  }

  const listContainer = document.createElement("div");
  renderWeakList(listContainer, allWeak, T);
  container.appendChild(listContainer);

  return createCard({
    title: T?.insightsWeakQuestions ?? "Weak Questions",
    content: container,
  });
}

// ============================================================================
// List Rendering
// ============================================================================

function renderWeakList(
  container: HTMLElement,
  questions: InsightsQuestionData[],
  T?: Translations,
): void {
  container.innerHTML = "";

  if (questions.length === 0) {
    const empty = document.createElement("p");
    empty.textContent =
      T?.insightsWeakQuestionsEmpty ?? "No weak questions found. Great work!";
    empty.style.color = "var(--text-secondary)";
    empty.style.fontSize = "0.875rem";
    container.appendChild(empty);
    return;
  }

  const list = createList(questions, (q) => buildWeakQuestionRow(q, T));
  container.appendChild(list);
}

function buildWeakQuestionRow(
  q: InsightsQuestionData,
  T?: Translations,
): HTMLElement {
  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.flexDirection = "column";
  row.style.gap = "4px";
  row.style.padding = "8px 0";

  // Header line: weakness + text + badges
  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.alignItems = "center";
  header.style.gap = "8px";
  header.style.cursor = "pointer";

  const weakBadge = createBadge(
    `${T?.weaknessPrefix ?? "W"}: ${q.weaknessScore.toFixed(1)}`,
    weaknessBadgeVariant(q.weaknessScore),
  );

  const preview = document.createElement("span");
  preview.textContent = truncateText(q.questionText);
  preview.style.flex = "1";
  preview.style.fontSize = "0.875rem";
  preview.style.color = "var(--text-primary)";
  preview.style.overflow = "hidden";
  preview.style.textOverflow = "ellipsis";
  preview.style.whiteSpace = "nowrap";

  const diffBadge = createBadge(
    translateDifficulty(q.difficultyLevel, T),
    difficultyBadgeVariant(q.difficultyLevel),
  );

  header.appendChild(weakBadge);
  header.appendChild(preview);
  header.appendChild(diffBadge);

  if (q.trapLevel !== "none") {
    header.appendChild(createBadge(`${T?.trapPrefix ?? "trap"}: ${q.trapLevel}`, "danger"));
  }

  // Toggle arrow
  const arrow = document.createElement("span");
  arrow.textContent = "▶";
  arrow.style.fontSize = "0.75rem";
  arrow.style.color = "var(--text-secondary)";
  arrow.style.transition = "transform 0.2s";
  header.appendChild(arrow);

  // Expandable feedback panel
  const feedbackPanel = buildFeedbackPanel(q, T);
  feedbackPanel.style.display = "none";

  header.addEventListener("click", () => {
    const isOpen = feedbackPanel.style.display !== "none";
    feedbackPanel.style.display = isOpen ? "none" : "block";
    arrow.textContent = isOpen ? "▶" : "▼";
  });

  row.appendChild(header);
  row.appendChild(feedbackPanel);

  return row;
}

// ============================================================================
// Feedback Panel
// ============================================================================

function buildFeedbackPanel(
  q: InsightsQuestionData,
  T?: Translations,
): HTMLElement {
  const panel = document.createElement("div");
  panel.style.paddingLeft = "16px";
  panel.style.borderLeft =
    "2px solid var(--border-color, rgba(255,255,255,0.1))";
  panel.style.marginTop = "4px";
  panel.style.fontSize = "0.8rem";

  // Answers list
  const answersTitle = document.createElement("div");
  answersTitle.textContent = T?.insightsAnswers ?? "Answers:";
  answersTitle.style.fontWeight = "600";
  answersTitle.style.color = "var(--text-primary)";
  answersTitle.style.marginBottom = "4px";
  panel.appendChild(answersTitle);

  for (const a of q.answers) {
    const ansRow = document.createElement("div");
    ansRow.style.padding = "2px 0";
    ansRow.style.color = a.isCorrect
      ? "var(--color-success, #4caf50)"
      : "var(--text-secondary)";
    ansRow.textContent = `${a.letter}) ${a.text}`;
    if (a.isCorrect) {
      ansRow.textContent += " ✓";
      ansRow.style.fontWeight = "600";
    }
    panel.appendChild(ansRow);
  }

  // Feedback
  if (q.feedback.explanation) {
    const explTitle = document.createElement("div");
    explTitle.textContent = T?.insightsExplanation ?? "Explanation:";
    explTitle.style.fontWeight = "600";
    explTitle.style.color = "var(--text-primary)";
    explTitle.style.marginTop = "8px";
    panel.appendChild(explTitle);

    const expl = document.createElement("p");
    expl.textContent = q.feedback.explanation;
    expl.style.color = "var(--text-secondary)";
    expl.style.margin = "4px 0";
    expl.style.lineHeight = "1.4";
    panel.appendChild(expl);
  }

  // Reference
  const ref = document.createElement("div");
  ref.textContent = `${T?.insightsReference ?? "Reference"}: ${q.referenceArticle}`;
  ref.style.color = "var(--text-secondary)";
  ref.style.marginTop = "4px";
  ref.style.fontStyle = "italic";
  panel.appendChild(ref);

  return panel;
}

// ============================================================================
// Category Filter
// ============================================================================

function applySelectStyles(select: HTMLSelectElement): void {
  select.style.padding = "6px 10px";
  select.style.fontSize = "0.85rem";
  select.style.fontFamily = "inherit";
  select.style.fontWeight = "500";
  select.style.color = "var(--text-primary)";
  select.style.backgroundColor = "var(--bg-secondary, #1e1e1e)";
  select.style.border = "1px solid var(--border-color, rgba(255,255,255,0.2))";
  select.style.borderRadius = "var(--radius-sm, 6px)";
  select.style.cursor = "pointer";
}

function buildCategoryFilter(
  categories: string[],
  onFilter: (category: string | null) => void,
  T?: Translations,
): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.style.display = "flex";
  wrapper.style.alignItems = "center";
  wrapper.style.gap = "8px";
  wrapper.style.marginBottom = "12px";

  const label = document.createElement("span");
  label.textContent = T?.insightsCategory ?? "Category:";
  label.style.fontSize = "0.8rem";
  label.style.fontWeight = "500";
  label.style.color = "var(--text-secondary)";
  label.style.whiteSpace = "nowrap";

  const select = document.createElement("select");
  applySelectStyles(select);

  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = T?.insightsAllCategories ?? "All categories";
  select.appendChild(allOption);

  for (const cat of categories) {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    select.appendChild(opt);
  }

  select.addEventListener("change", () => {
    onFilter(select.value || null);
  });

  wrapper.appendChild(label);
  wrapper.appendChild(select);
  return wrapper;
}

// ============================================================================
// Helpers
// ============================================================================

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

function weaknessBadgeVariant(score: number): BadgeVariant {
  if (score >= 4) return "danger";
  if (score >= 2) return "warning";
  return "info";
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
