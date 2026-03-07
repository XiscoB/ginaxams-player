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
 * @returns The telemetry dashboard HTMLElement
 */
export async function renderTelemetryView(
  controller: ExamLibraryController,
): Promise<HTMLElement> {
  const data = await controller.getTelemetryData();

  const performanceCard = buildQuestionPerformanceCard(data);
  const failedCard = buildMostFailedCard(data);
  const slowestCard = buildSlowestCard(data);
  const unseenCard = buildUnseenCard(data);

  return createSection({
    title: "Telemetry",
    description: "Per-question performance and learning behavior analytics.",
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

function buildQuestionPerformanceCard(data: TelemetryViewData): HTMLElement {
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
    );
    container.appendChild(controls);

    const filtered = applyFilters();
    const table = buildPerformanceTable(filtered);
    container.appendChild(table);
  }

  render();

  return createCard({
    title: "Question Performance",
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
): HTMLElement {
  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.flexWrap = "wrap";
  row.style.gap = "8px";
  row.style.marginBottom = "12px";
  row.style.alignItems = "center";

  // Sort dropdown
  const sortLabel = document.createElement("label");
  sortLabel.textContent = "Sort: ";
  sortLabel.style.fontSize = "0.85em";

  const sortSelect = document.createElement("select");
  sortSelect.className = "gx-select";
  const sortOptions: Array<{ value: TelemetrySortKey; label: string }> = [
    { value: "mostWrong", label: "Most wrong" },
    { value: "mostSeen", label: "Most seen" },
    { value: "leastSeen", label: "Least seen" },
    { value: "slowestResponse", label: "Slowest response" },
    { value: "recentlySeen", label: "Recently seen" },
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

  sortLabel.appendChild(sortSelect);
  row.appendChild(sortLabel);

  // Filter dropdown (seen/unseen/all)
  const filterLabel = document.createElement("label");
  filterLabel.textContent = "Filter: ";
  filterLabel.style.fontSize = "0.85em";

  const filterSelect = document.createElement("select");
  filterSelect.className = "gx-select";
  const filterOptions: Array<{ value: string; label: string }> = [
    { value: "all", label: "All" },
    { value: "seen", label: "Seen" },
    { value: "unseen", label: "Unseen" },
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

  filterLabel.appendChild(filterSelect);
  row.appendChild(filterLabel);

  // Category dropdown
  if (categories.length > 0) {
    const catLabel = document.createElement("label");
    catLabel.textContent = "Category: ";
    catLabel.style.fontSize = "0.85em";

    const catSelect = document.createElement("select");
    catSelect.className = "gx-select";

    const allOpt = document.createElement("option");
    allOpt.value = "";
    allOpt.textContent = "All categories";
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

    catLabel.appendChild(catSelect);
    row.appendChild(catLabel);
  }

  return row;
}

function buildPerformanceTable(
  questions: readonly TelemetryQuestionData[],
): HTMLElement {
  if (questions.length === 0) {
    const empty = document.createElement("div");
    empty.className = "gx-list__empty";
    empty.textContent = "No questions match the current filters.";
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
    "#",
    "Category",
    "Seen",
    "Correct",
    "Wrong",
    "Blank",
    "Avg Time",
    "Last Seen",
    "Stability",
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
      `Q${q.questionNumber}`,
      q.categories.join(", "),
      String(q.totalSeen),
      String(q.timesCorrect),
      String(q.timesWrong),
      String(q.timesBlank),
      formatResponseTime(q.avgResponseTimeMs),
      q.lastSeenAt ? new Date(q.lastSeenAt).toLocaleDateString() : "Never",
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
      createBadge(stability, stabilityBadgeVariant(stability)),
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

function buildMostFailedCard(data: TelemetryViewData): HTMLElement {
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
      title.textContent = `Q${q.questionNumber}`;
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

      const stats = document.createElement("span");
      stats.textContent = `Wrong: ${q.timesWrong} / Seen: ${q.totalSeen}`;
      stats.style.fontSize = "0.85em";
      right.appendChild(stats);

      const stability = computeStability(q);
      right.appendChild(
        createBadge(stability, stabilityBadgeVariant(stability)),
      );

      item.appendChild(left);
      item.appendChild(right);
      return item;
    },
    emptyMessage: "No failed questions yet.",
  });

  return createCard({
    title: "Most Failed Questions",
    content,
  });
}

// ============================================================================
// Card 3 — Slowest Questions
// ============================================================================

function buildSlowestCard(data: TelemetryViewData): HTMLElement {
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
      title.textContent = `Q${q.questionNumber}`;
      left.appendChild(title);

      const cat = document.createElement("span");
      cat.textContent = ` — ${q.categories.join(", ")}`;
      cat.style.color = "var(--color-text-muted, #666)";
      cat.style.fontSize = "0.9em";
      left.appendChild(cat);

      const right = document.createElement("div");
      const time = document.createElement("span");
      time.textContent = `Avg Time: ${formatResponseTime(q.avgResponseTimeMs)}`;
      time.style.fontSize = "0.85em";
      right.appendChild(time);

      item.appendChild(left);
      item.appendChild(right);
      return item;
    },
    emptyMessage: "No questions have been attempted yet.",
  });

  return createCard({
    title: "Slowest Questions",
    content,
  });
}

// ============================================================================
// Card 4 — Unseen Questions
// ============================================================================

function buildUnseenCard(data: TelemetryViewData): HTMLElement {
  const unseen = filterUnseenQuestions(data.questions);
  const unseenByCategory = computeUnseenByCategory(data.questions);

  const container = document.createElement("div");

  // Summary count
  const summary = document.createElement("p");
  summary.style.marginTop = "0";
  summary.innerHTML = `<strong>Questions never practiced:</strong> ${unseen.length}`;
  container.appendChild(summary);

  // Category distribution
  if (unseenByCategory.size > 0) {
    const catHeader = document.createElement("p");
    catHeader.textContent = "Unseen by category:";
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
      emptyMessage: "All questions have been attempted!",
    });
    container.appendChild(catList);
  }

  return createCard({
    title: "Unseen Questions",
    content: container,
  });
}

// ============================================================================
// Helpers
// ============================================================================

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
