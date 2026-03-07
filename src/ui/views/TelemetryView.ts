/**
 * TelemetryView — Telemetry Dashboard screen (Phase 15)
 *
 * Composes UI primitives to display:
 * - Question Performance Table (sortable, filterable)
 * - Most Failed Questions Card
 * - Slowest Questions Card
 * - Unseen Questions Card
 *
 * Data is fetched from ExamLibraryController.getTelemetryData().
 * No domain imports — only view helpers and UI primitives.
 *
 * Telemetry is read-only. This view visualizes existing telemetry data
 * without modifying telemetry logic, weakness formulas, or scoring.
 */

import type { ExamLibraryController } from "../../application/examLibraryController.js";
import type {
  TelemetryQuestionData,
  TelemetryViewData,
} from "../../application/viewState.js";
import type { Translations } from "../../i18n/index.js";

import { createSection } from "../components/Section.js";
import { createStack } from "../components/Stack.js";
import { createCard } from "../components/Card.js";
import { createList } from "../components/List.js";
import { createBadge } from "../components/Badge.js";
import type { BadgeVariant } from "../components/Badge.js";

import {
  sortQuestions,
  filterUnseenQuestions,
  filterByCategory,
  filterSeenQuestions,
  computeStability,
  formatResponseTime,
  getTopFailedQuestions,
  getTopSlowestQuestions,
  computeUnseenByCategory,
  type TelemetrySortKey,
  type StabilityLevel,
} from "./telemetry/telemetryHelpers.js";

// ============================================================================
// Shared Select Styles
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

// ============================================================================
// Constants
// ============================================================================

const TOP_LIMIT = 10;

// ============================================================================
// TelemetryView — Main Entry Point
// ============================================================================

/**
 * Render the Telemetry Dashboard view.
 *
 * This is an async function because it fetches data from the controller.
 * Returns a fully composed HTMLElement ready for mounting.
 *
 * @param controller - The ExamLibraryController instance
 * @param T - Optional translations for i18n
 * @returns The telemetry dashboard HTMLElement
 */
export async function renderTelemetryView(
  controller: ExamLibraryController,
  T?: Translations,
): Promise<HTMLElement> {
  const data = await controller.getTelemetryData();

  // Empty state: no telemetry data at all
  if (data.questions.length === 0) {
    const emptyContainer = document.createElement("div");
    emptyContainer.style.textAlign = "center";
    emptyContainer.style.padding = "48px 16px";

    const emptyTitle = document.createElement("h3");
    emptyTitle.textContent =
      T?.telemetryEmptyTitle ?? "No telemetry data available yet.";
    emptyTitle.style.color = "var(--text-primary)";
    emptyTitle.style.marginBottom = "8px";
    emptyContainer.appendChild(emptyTitle);

    const emptyMsg = document.createElement("p");
    emptyMsg.textContent =
      T?.telemetryEmptyMessage ?? "Practice questions to generate statistics.";
    emptyMsg.style.color = "var(--text-secondary)";
    emptyMsg.style.fontSize = "0.9rem";
    emptyContainer.appendChild(emptyMsg);

    return createSection({
      title: T?.telemetryTitle ?? "Telemetry",
      description:
        T?.telemetryDescription ??
        "Per-question performance and learning behavior analytics.",
      content: emptyContainer,
    });
  }

  const performanceCard = buildQuestionPerformanceCard(data, T);
  const failedCard = buildMostFailedCard(data, T);
  const slowestCard = buildSlowestCard(data, T);
  const unseenCard = buildUnseenCard(data, T);

  return createSection({
    title: T?.telemetryTitle ?? "Telemetry",
    description:
      T?.telemetryDescription ??
      "Per-question performance and learning behavior analytics.",
    content: createStack({
      direction: "column",
      gap: 16,
      children: [performanceCard, failedCard, slowestCard, unseenCard],
    }),
  });
}

// ============================================================================
// Card 1 — Question Performance Table
// ============================================================================

function buildQuestionPerformanceCard(
  data: TelemetryViewData,
  T?: Translations,
): HTMLElement {
  let currentSort: TelemetrySortKey = "mostWrong";
  let currentFilter: "all" | "seen" | "unseen" = "all";
  let currentCategory: string | null = null;

  const container = document.createElement("div");

  function applyFilters(): TelemetryQuestionData[] {
    let questions = data.questions;

    // Category filter
    if (currentCategory) {
      questions = filterByCategory(questions, currentCategory);
    }

    // Seen/unseen filter
    if (currentFilter === "seen") {
      questions = filterSeenQuestions(questions);
    } else if (currentFilter === "unseen") {
      questions = filterUnseenQuestions(questions);
    }

    // Sort
    return sortQuestions(questions, currentSort);
  }

  function render(): void {
    container.innerHTML = "";

    const controls = buildControls(
      data.allCategories,
      currentSort,
      currentFilter,
      currentCategory,
      (sort) => {
        currentSort = sort;
        render();
      },
      (filter) => {
        currentFilter = filter;
        render();
      },
      (cat) => {
        currentCategory = cat;
        render();
      },
      T,
    );
    container.appendChild(controls);

    const filtered = applyFilters();
    const table = buildPerformanceTable(filtered, T);
    container.appendChild(table);
  }

  render();

  return createCard({
    title: T?.telemetryQuestionPerformance ?? "Question Performance",
    content: container,
  });
}

function buildControls(
  categories: string[],
  currentSort: TelemetrySortKey,
  currentFilter: "all" | "seen" | "unseen",
  currentCategory: string | null,
  onSortChange: (sort: TelemetrySortKey) => void,
  onFilterChange: (filter: "all" | "seen" | "unseen") => void,
  onCategoryChange: (cat: string | null) => void,
  T?: Translations,
): HTMLElement {
  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.flexWrap = "wrap";
  row.style.gap = "12px";
  row.style.marginBottom = "12px";
  row.style.alignItems = "center";

  // Sort dropdown
  const sortGroup = document.createElement("div");
  sortGroup.style.display = "flex";
  sortGroup.style.alignItems = "center";
  sortGroup.style.gap = "6px";

  const sortLabel = document.createElement("span");
  sortLabel.textContent = T?.telemetrySortLabel ?? "Sort:";
  sortLabel.style.fontSize = "0.8rem";
  sortLabel.style.fontWeight = "500";
  sortLabel.style.color = "var(--text-secondary)";
  sortLabel.style.whiteSpace = "nowrap";

  const sortSelect = document.createElement("select");
  applySelectStyles(sortSelect);
  const sortOptions: Array<{ value: TelemetrySortKey; label: string }> = [
    { value: "mostWrong", label: T?.telemetrySortMostWrong ?? "Most wrong" },
    { value: "mostSeen", label: T?.telemetrySortMostSeen ?? "Most seen" },
    { value: "leastSeen", label: T?.telemetrySortLeastSeen ?? "Least seen" },
    {
      value: "slowestResponse",
      label: T?.telemetrySortSlowest ?? "Slowest response",
    },
    { value: "recentlySeen", label: T?.telemetrySortRecent ?? "Recently seen" },
  ];
  for (const opt of sortOptions) {
    const option = document.createElement("option");
    option.value = opt.value;
    option.textContent = opt.label;
    if (opt.value === currentSort) option.selected = true;
    sortSelect.appendChild(option);
  }
  sortSelect.addEventListener("change", () => {
    onSortChange(sortSelect.value as TelemetrySortKey);
  });

  sortGroup.appendChild(sortLabel);
  sortGroup.appendChild(sortSelect);
  row.appendChild(sortGroup);

  // Filter dropdown (seen/unseen/all)
  const filterGroup = document.createElement("div");
  filterGroup.style.display = "flex";
  filterGroup.style.alignItems = "center";
  filterGroup.style.gap = "6px";

  const filterLabel = document.createElement("span");
  filterLabel.textContent = T?.telemetryFilterLabel ?? "Filter:";
  filterLabel.style.fontSize = "0.8rem";
  filterLabel.style.fontWeight = "500";
  filterLabel.style.color = "var(--text-secondary)";
  filterLabel.style.whiteSpace = "nowrap";

  const filterSelect = document.createElement("select");
  applySelectStyles(filterSelect);
  const filterOptions: Array<{ value: string; label: string }> = [
    { value: "all", label: T?.telemetryFilterAll ?? "All" },
    { value: "seen", label: T?.telemetryFilterSeen ?? "Seen" },
    { value: "unseen", label: T?.telemetryFilterUnseen ?? "Unseen" },
  ];
  for (const opt of filterOptions) {
    const option = document.createElement("option");
    option.value = opt.value;
    option.textContent = opt.label;
    if (opt.value === currentFilter) option.selected = true;
    filterSelect.appendChild(option);
  }
  filterSelect.addEventListener("change", () => {
    onFilterChange(filterSelect.value as "all" | "seen" | "unseen");
  });

  filterGroup.appendChild(filterLabel);
  filterGroup.appendChild(filterSelect);
  row.appendChild(filterGroup);

  // Category dropdown
  if (categories.length > 0) {
    const catGroup = document.createElement("div");
    catGroup.style.display = "flex";
    catGroup.style.alignItems = "center";
    catGroup.style.gap = "6px";

    const catLabel = document.createElement("span");
    catLabel.textContent = T?.telemetryCategoryLabel ?? "Category:";
    catLabel.style.fontSize = "0.8rem";
    catLabel.style.fontWeight = "500";
    catLabel.style.color = "var(--text-secondary)";
    catLabel.style.whiteSpace = "nowrap";

    const catSelect = document.createElement("select");
    applySelectStyles(catSelect);

    const allOpt = document.createElement("option");
    allOpt.value = "";
    allOpt.textContent = T?.telemetryCategoryAll ?? "All categories";
    if (!currentCategory) allOpt.selected = true;
    catSelect.appendChild(allOpt);

    for (const cat of categories) {
      const option = document.createElement("option");
      option.value = cat;
      option.textContent = cat;
      if (cat === currentCategory) option.selected = true;
      catSelect.appendChild(option);
    }
    catSelect.addEventListener("change", () => {
      onCategoryChange(catSelect.value || null);
    });

    catGroup.appendChild(catLabel);
    catGroup.appendChild(catSelect);
    row.appendChild(catGroup);
  }

  return row;
}

function buildPerformanceTable(
  questions: readonly TelemetryQuestionData[],
  T?: Translations,
): HTMLElement {
  if (questions.length === 0) {
    const empty = document.createElement("div");
    empty.className = "gx-list__empty";
    empty.textContent =
      T?.telemetryNoMatchingQuestions ??
      "No questions match the current filters.";
    return empty;
  }

  const table = document.createElement("table");
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";
  table.style.fontSize = "0.85em";

  // Header
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  const headers = [
    T?.telemetryColQuestion ?? "#",
    T?.telemetryColCategory ?? "Category",
    T?.telemetryColSeen ?? "Seen",
    T?.telemetryColCorrect ?? "Correct",
    T?.telemetryColWrong ?? "Wrong",
    T?.telemetryColBlank ?? "Blank",
    T?.telemetryColAvgTime ?? "Avg Time",
    T?.telemetryColLastSeen ?? "Last Seen",
    T?.telemetryColStability ?? "Stability",
  ];
  for (const text of headers) {
    const th = document.createElement("th");
    th.textContent = text;
    th.style.textAlign = "left";
    th.style.padding = "6px 8px";
    th.style.borderBottom = "2px solid var(--color-border, #ddd)";
    th.style.whiteSpace = "nowrap";
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Body
  const tbody = document.createElement("tbody");
  for (const q of questions) {
    const row = document.createElement("tr");

    const cells = [
      `${T?.questionPrefix ?? "Q"}${q.questionNumber}`,
      q.categories.join(", "),
      String(q.totalSeen),
      String(q.timesCorrect),
      String(q.timesWrong),
      String(q.timesBlank),
      formatResponseTime(q.avgResponseTimeMs),
      q.lastSeenAt
        ? new Date(q.lastSeenAt).toLocaleDateString(T?.locale ?? undefined)
        : (T?.telemetryNever ?? "Never"),
    ];

    for (const cellText of cells) {
      const td = document.createElement("td");
      td.textContent = cellText;
      td.style.padding = "4px 8px";
      td.style.borderBottom = "1px solid var(--color-border, #eee)";
      row.appendChild(td);
    }

    // Stability badge
    const stabilityTd = document.createElement("td");
    stabilityTd.style.padding = "4px 8px";
    stabilityTd.style.borderBottom = "1px solid var(--color-border, #eee)";
    const stability = computeStability(q);
    stabilityTd.appendChild(
      createBadge(
        translateStability(stability, T),
        stabilityBadgeVariant(stability),
      ),
    );
    row.appendChild(stabilityTd);

    tbody.appendChild(row);
  }
  table.appendChild(tbody);

  // Wrap in scrollable container
  const wrapper = document.createElement("div");
  wrapper.style.overflowX = "auto";
  wrapper.appendChild(table);

  return wrapper;
}

// ============================================================================
// Card 2 — Most Failed Questions
// ============================================================================

function buildMostFailedCard(
  data: TelemetryViewData,
  T?: Translations,
): HTMLElement {
  const topFailed = getTopFailedQuestions(data.questions, TOP_LIMIT);

  const content = createList({
    items: topFailed,
    renderItem: (q) => {
      const item = document.createElement("div");
      item.style.display = "flex";
      item.style.justifyContent = "space-between";
      item.style.alignItems = "center";
      item.style.padding = "6px 0";

      const left = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = `${T?.questionPrefix ?? "Q"}${q.questionNumber}`;
      left.appendChild(title);

      const cat = document.createElement("span");
      cat.textContent = ` — ${q.categories.join(", ")}`;
      cat.style.color = "var(--color-text-muted, #666)";
      cat.style.fontSize = "0.9em";
      left.appendChild(cat);

      const right = document.createElement("div");
      right.style.display = "flex";
      right.style.gap = "8px";
      right.style.alignItems = "center";

      const wrongLabel = T?.telemetryWrongCount ?? "Wrong";
      const seenLabel = T?.telemetrySeenCount ?? "Seen";
      const stats = document.createElement("span");
      stats.textContent = `${wrongLabel}: ${q.timesWrong} / ${seenLabel}: ${q.totalSeen}`;
      stats.style.fontSize = "0.85em";
      right.appendChild(stats);

      const stability = computeStability(q);
      right.appendChild(
        createBadge(
          translateStability(stability, T),
          stabilityBadgeVariant(stability),
        ),
      );

      item.appendChild(left);
      item.appendChild(right);
      return item;
    },
    emptyMessage: T?.telemetryNoFailedQuestions ?? "No failed questions yet.",
  });

  return createCard({
    title: T?.telemetryMostFailed ?? "Most Failed Questions",
    content,
  });
}

// ============================================================================
// Card 3 — Slowest Questions
// ============================================================================

function buildSlowestCard(
  data: TelemetryViewData,
  T?: Translations,
): HTMLElement {
  const topSlowest = getTopSlowestQuestions(data.questions, TOP_LIMIT);

  const content = createList({
    items: topSlowest,
    renderItem: (q) => {
      const item = document.createElement("div");
      item.style.display = "flex";
      item.style.justifyContent = "space-between";
      item.style.alignItems = "center";
      item.style.padding = "6px 0";

      const left = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = `${T?.questionPrefix ?? "Q"}${q.questionNumber}`;
      left.appendChild(title);

      const cat = document.createElement("span");
      cat.textContent = ` — ${q.categories.join(", ")}`;
      cat.style.color = "var(--color-text-muted, #666)";
      cat.style.fontSize = "0.9em";
      left.appendChild(cat);

      const right = document.createElement("div");
      const time = document.createElement("span");
      time.textContent = `${T?.telemetryAvgTimeLabel ?? "Avg Time"}: ${formatResponseTime(q.avgResponseTimeMs)}`;
      time.style.fontSize = "0.85em";
      right.appendChild(time);

      item.appendChild(left);
      item.appendChild(right);
      return item;
    },
    emptyMessage:
      T?.telemetryNoAttemptedQuestions ??
      "No questions have been attempted yet.",
  });

  return createCard({
    title: T?.telemetrySlowest ?? "Slowest Questions",
    content,
  });
}

// ============================================================================
// Card 4 — Unseen Questions
// ============================================================================

function buildUnseenCard(
  data: TelemetryViewData,
  T?: Translations,
): HTMLElement {
  const unseen = filterUnseenQuestions(data.questions);
  const unseenByCategory = computeUnseenByCategory(data.questions);

  const container = document.createElement("div");

  // Summary count
  const summary = document.createElement("p");
  summary.style.marginTop = "0";
  summary.innerHTML = `<strong>${T?.telemetryNeverPracticed ?? "Questions never practiced"}:</strong> ${unseen.length}`;
  container.appendChild(summary);

  // Category distribution
  if (unseenByCategory.size > 0) {
    const catHeader = document.createElement("p");
    catHeader.textContent =
      T?.telemetryUnseenByCategory ?? "Unseen by category:";
    catHeader.style.fontWeight = "600";
    catHeader.style.fontSize = "0.9em";
    catHeader.style.marginBottom = "4px";
    container.appendChild(catHeader);

    const catList = createList({
      items: [...unseenByCategory.entries()].sort((a, b) => b[1] - a[1]),
      renderItem: ([category, count]) => {
        const item = document.createElement("div");
        item.style.display = "flex";
        item.style.justifyContent = "space-between";
        item.style.padding = "2px 0";
        item.style.fontSize = "0.85em";

        const name = document.createElement("span");
        name.textContent = category;
        item.appendChild(name);

        const countEl = document.createElement("span");
        countEl.textContent = String(count);
        countEl.style.fontWeight = "600";
        item.appendChild(countEl);

        return item;
      },
      emptyMessage:
        T?.telemetryAllAttempted ?? "All questions have been attempted!",
    });
    container.appendChild(catList);
  }

  return createCard({
    title: T?.telemetryUnseen ?? "Unseen Questions",
    content: container,
  });
}

// ============================================================================
// Helpers
// ============================================================================

function translateStability(level: StabilityLevel, T?: Translations): string {
  switch (level) {
    case "stable":
      return T?.stabilityStable ?? "stable";
    case "unstable":
      return T?.stabilityUnstable ?? "unstable";
    case "unlearned":
      return T?.stabilityUnlearned ?? "unlearned";
    case "unseen":
      return T?.stabilityUnseen ?? "unseen";
  }
}

function stabilityBadgeVariant(level: StabilityLevel): BadgeVariant {
  switch (level) {
    case "stable":
      return "success";
    case "unstable":
      return "warning";
    case "unlearned":
      return "danger";
    case "unseen":
      return "neutral";
  }
}
