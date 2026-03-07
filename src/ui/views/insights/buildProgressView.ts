/**
 * Progress View Builder — Insights Phase 12
 *
 * Renders the Progress Timeline card with:
 * - Visual progress chart (SVG sparkline)
 * - Attempt history list sorted newest first
 * - Clickable attempts for results navigation
 *
 * No domain imports — uses Attempt type from InsightsViewData only.
 */

import type { InsightsViewData } from "../../../application/viewState.js";
import type { Attempt } from "../../../domain/types.js";
import type { BadgeVariant } from "../../components/Badge.js";
import type { Translations } from "../../../i18n/index.js";

import { createCard } from "../../components/Card.js";
import { createStack } from "../../components/Stack.js";
import { createList } from "../../components/List.js";
import { createBadge } from "../../components/Badge.js";

// ============================================================================
// Main Builder
// ============================================================================

/**
 * Build the Progress Timeline card.
 *
 * @param data - Full insights data
 * @param onAttemptClick - Optional callback when an attempt is clicked
 * @returns Card HTMLElement
 */
export function buildProgressView(
  data: InsightsViewData,
  onAttemptClick?: (attemptId: string) => void,
  T?: Translations,
): HTMLElement {
  // Filter to attempts with results and sort newest first
  const completedAttempts = data.attempts
    .filter((a) => a.result !== undefined && a.type !== "free")
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

  const title = T?.insightsProgressTimeline ?? "Progress";

  if (completedAttempts.length === 0) {
    const empty = document.createElement("p");
    empty.textContent =
      T?.insightsProgressEmpty ??
      "No attempt history yet. Complete simulacros or reviews to track progress.";
    empty.style.color = "var(--text-secondary)";
    empty.style.fontSize = "0.875rem";
    return createCard({ title, content: empty });
  }

  const children: HTMLElement[] = [];

  // SVG sparkline chart (if enough data points)
  if (completedAttempts.length >= 2) {
    const chart = buildSparkline(completedAttempts);
    children.push(chart);
  }

  // Attempt history list
  const list = createList(completedAttempts.slice(0, 20), (attempt) =>
    buildAttemptRow(attempt, onAttemptClick, T),
  );
  children.push(list);

  const content = createStack({
    direction: "column",
    gap: 12,
    children,
  });

  return createCard({ title, content });
}

// ============================================================================
// Sparkline Chart (SVG)
// ============================================================================

function buildSparkline(attempts: Attempt[]): HTMLElement {
  const width = 320;
  const height = 80;
  const padding = 8;

  // Use percentages as data points (newest last for chart)
  const points = [...attempts]
    .reverse()
    .slice(-20) // last 20 attempts
    .map((a) => a.result?.percentage ?? 0);

  if (points.length < 2) {
    return document.createElement("div");
  }

  const maxVal = 100;
  const minVal = 0;
  const xStep = (width - padding * 2) / (points.length - 1);

  const toX = (i: number) => padding + i * xStep;
  const toY = (v: number) =>
    height -
    padding -
    ((v - minVal) / (maxVal - minVal)) * (height - padding * 2);

  // Build SVG path
  let pathD = `M ${toX(0)} ${toY(points[0])}`;
  for (let i = 1; i < points.length; i++) {
    pathD += ` L ${toX(i)} ${toY(points[i])}`;
  }

  const svgNS = "http://www.w3.org/2000/svg";

  const container = document.createElement("div");
  container.style.width = "100%";
  container.style.maxWidth = `${width}px`;
  container.style.margin = "0 auto";

  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("width", "100%");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.style.display = "block";

  // Grid lines at 25%, 50%, 75%
  for (const pct of [25, 50, 75]) {
    const line = document.createElementNS(svgNS, "line");
    line.setAttribute("x1", String(padding));
    line.setAttribute("x2", String(width - padding));
    line.setAttribute("y1", String(toY(pct)));
    line.setAttribute("y2", String(toY(pct)));
    line.setAttribute("stroke", "var(--border-color, rgba(255,255,255,0.08))");
    line.setAttribute("stroke-width", "0.5");
    line.setAttribute("stroke-dasharray", "4 4");
    svg.appendChild(line);
  }

  // Line path
  const path = document.createElementNS(svgNS, "path");
  path.setAttribute("d", pathD);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "var(--accent-primary, #00d4ff)");
  path.setAttribute("stroke-width", "2");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.appendChild(path);

  // Data point dots
  for (let i = 0; i < points.length; i++) {
    const circle = document.createElementNS(svgNS, "circle");
    circle.setAttribute("cx", String(toX(i)));
    circle.setAttribute("cy", String(toY(points[i])));
    circle.setAttribute("r", "3");
    circle.setAttribute("fill", "var(--accent-primary, #00d4ff)");
    svg.appendChild(circle);
  }

  container.appendChild(svg);
  return container;
}

// ============================================================================
// Attempt Row
// ============================================================================

function buildAttemptRow(
  attempt: Attempt,
  onAttemptClick?: (attemptId: string) => void,
  T?: Translations,
): HTMLElement {
  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.alignItems = "center";
  row.style.justifyContent = "space-between";
  row.style.gap = "8px";
  row.style.padding = "6px 0";
  row.style.fontSize = "0.875rem";

  if (onAttemptClick) {
    row.style.cursor = "pointer";
    row.addEventListener("click", () => onAttemptClick(attempt.id));
  }

  // Left: date + mode badge
  const left = document.createElement("div");
  left.style.display = "flex";
  left.style.alignItems = "center";
  left.style.gap = "8px";

  const dateEl = document.createElement("span");
  dateEl.textContent = formatDate(attempt.createdAt, T?.locale);
  dateEl.style.color = "var(--text-secondary)";
  dateEl.style.fontSize = "0.8rem";
  dateEl.style.minWidth = "8ch";

  const modeBadge = createBadge(translateMode(attempt.type, T), modeBadgeVariant(attempt.type));

  left.appendChild(dateEl);
  left.appendChild(modeBadge);

  // Right: score + percentage
  const right = document.createElement("div");
  right.style.display = "flex";
  right.style.alignItems = "center";
  right.style.gap = "8px";

  if (attempt.result) {
    const scoreEl = document.createElement("span");
    scoreEl.textContent = `${attempt.result.correct}/${attempt.result.correct + attempt.result.wrong + attempt.result.blank}`;
    scoreEl.style.color = "var(--text-secondary)";

    const pctEl = document.createElement("span");
    pctEl.textContent = `${attempt.result.percentage}%`;
    pctEl.style.fontWeight = "600";
    pctEl.style.color = percentageColor(attempt.result.percentage);

    right.appendChild(scoreEl);
    right.appendChild(pctEl);
  }

  row.appendChild(left);
  row.appendChild(right);

  return row;
}

// ============================================================================
// Helpers
// ============================================================================

function translateMode(mode: "free" | "simulacro" | "review", T?: Translations): string {
  switch (mode) {
    case "free":
      return T?.modeFree ?? "Free";
    case "simulacro":
      return T?.modeSimulacro ?? "Simulacro";
    case "review":
      return T?.modeReview ?? "Review";
  }
}

function formatDate(isoString: string, locale?: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString(locale ?? undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return isoString;
  }
}

function modeBadgeVariant(mode: "free" | "simulacro" | "review"): BadgeVariant {
  switch (mode) {
    case "simulacro":
      return "info";
    case "review":
      return "warning";
    case "free":
      return "neutral";
  }
}

function percentageColor(pct: number): string {
  if (pct >= 70) return "var(--color-success, #4caf50)";
  if (pct >= 50) return "var(--color-warning, #ff9800)";
  return "var(--color-error, #f44336)";
}
