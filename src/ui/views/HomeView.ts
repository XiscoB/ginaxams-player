/**
 * HomeView — Home Dashboard screen (Phase 11)
 *
 * Composes UI primitives to display:
 * - Exam Readiness gauge with breakdown
 * - Study Recommendation card
 * - Quick Stats card
 *
 * Data is fetched from ExamLibraryController.getHomeViewData().
 * No domain imports — only view helpers and UI primitives.
 */

import type { ExamLibraryController } from "../../application/examLibraryController.js";
import type { HomeViewData } from "../../application/viewState.js";
import type { BadgeVariant } from "../components/Badge.js";

import { createSection } from "../components/Section.js";
import { createStack } from "../components/Stack.js";
import { createCard } from "../components/Card.js";
import { createGauge } from "../components/Gauge.js";
import { createList } from "../components/List.js";
import { createBadge } from "../components/Badge.js";
import { createButton } from "../components/Button.js";
import { createProgressBar } from "../components/ProgressBar.js";

import {
  buildRecommendation,
  type Recommendation,
} from "./home/buildRecommendation.js";
import { computeQuickStats, type QuickStats } from "./home/computeQuickStats.js";

// ============================================================================
// HomeView
// ============================================================================

/**
 * Render the Home Dashboard view.
 *
 * This is an async function because it fetches data from the controller.
 * Returns a fully composed HTMLElement ready for mounting.
 *
 * @param controller - The ExamLibraryController instance
 * @param callbacks - Optional navigation callbacks for action buttons
 * @returns The home dashboard HTMLElement
 */
export async function renderHomeView(
  controller: ExamLibraryController,
  callbacks?: {
    startReview?: () => void;
    startSimulacro?: () => void;
  },
): Promise<HTMLElement> {
  const data = await controller.getHomeViewData();

  const readinessCard = buildReadinessCard(data);
  const recommendationCard = buildRecommendationCard(data, callbacks);
  const quickStatsCard = buildQuickStatsCard(data);

  return createSection({
    title: "Training Overview",
    description: "Your study progress at a glance.",
    content: createStack({
      direction: "column",
      gap: 16,
      children: [readinessCard, recommendationCard, quickStatsCard],
    }),
  });
}

// ============================================================================
// Card Builders
// ============================================================================

/**
 * Build the Exam Readiness card with gauge and breakdown list.
 */
function buildReadinessCard(data: HomeViewData): HTMLElement {
  const gauge = createGauge({
    value: data.readiness.score,
    min: 0,
    max: 100,
    label: levelLabel(data.readiness.level),
    size: 140,
  });

  // Apply level-based color to the gauge fill arc
  const fillPath = gauge.querySelector(".gx-gauge__fill");
  if (fillPath instanceof SVGElement) {
    fillPath.setAttribute("stroke", readinessColor(data.readiness.score));
  }

  const breakdownItems: ReadonlyArray<{ label: string; value: number }> = [
    {
      label: "Category mastery",
      value: Math.round(data.readiness.breakdown.categoryMastery * 100),
    },
    {
      label: "Simulacro accuracy",
      value: Math.round(data.readiness.breakdown.simulacroAccuracy * 100),
    },
    {
      label: "Recovery rate",
      value: Math.round(data.readiness.breakdown.recoveryRate * 100),
    },
  ];

  const breakdownList = createList(
    breakdownItems,
    (item) => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.justifyContent = "space-between";
      row.style.gap = "var(--space-md)";

      const label = document.createElement("span");
      label.textContent = item.label;
      label.style.color = "var(--text-secondary)";
      label.style.fontSize = "0.875rem";

      const barContainer = document.createElement("div");
      barContainer.style.flex = "1";
      barContainer.style.maxWidth = "120px";
      barContainer.appendChild(
        createProgressBar({
          percent: item.value,
          variant: item.value >= 70 ? "success" : item.value >= 40 ? "warning" : "danger",
        }),
      );

      const valueEl = document.createElement("span");
      valueEl.textContent = `${item.value}%`;
      valueEl.style.fontSize = "0.875rem";
      valueEl.style.fontWeight = "600";
      valueEl.style.color = "var(--text-primary)";
      valueEl.style.minWidth = "3ch";
      valueEl.style.textAlign = "right";

      row.appendChild(label);
      row.appendChild(barContainer);
      row.appendChild(valueEl);
      return row;
    },
  );

  const content = createStack({
    direction: "column",
    gap: 16,
    align: "center",
    children: [gauge, breakdownList],
  });

  return createCard({ title: "Exam Readiness", content });
}

/**
 * Build the Study Recommendation card.
 */
function buildRecommendationCard(
  data: HomeViewData,
  callbacks?: {
    startReview?: () => void;
    startSimulacro?: () => void;
  },
): HTMLElement {
  const rec: Recommendation = buildRecommendation(data, callbacks);

  const badge = createBadge(levelLabel(rec.level), levelBadgeVariant(rec.level));

  const message = document.createElement("p");
  message.textContent = rec.message;
  message.style.color = "var(--text-secondary)";
  message.style.fontSize = "0.875rem";
  message.style.lineHeight = "1.5";
  message.style.margin = "0";

  const button = createButton({
    label: rec.actionLabel,
    variant: "primary",
    onClick: rec.action,
  });

  const content = createStack({
    direction: "column",
    gap: 12,
    children: [badge, message, button],
  });

  return createCard({ title: "Recommendation", content });
}

/**
 * Build the Quick Stats card.
 */
function buildQuickStatsCard(data: HomeViewData): HTMLElement {
  const stats: QuickStats = computeQuickStats(data);

  const statItems: ReadonlyArray<{ label: string; value: string }> = [
    {
      label: "Weak categories",
      value: String(stats.weakCategories),
    },
    {
      label: "Last simulacro score",
      value:
        stats.lastSimulacroScore !== null
          ? `${stats.lastSimulacroScore}%`
          : "—",
    },
    {
      label: "Questions today",
      value: String(stats.questionsSeenToday),
    },
  ];

  const list = createList(statItems, (item) => {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.alignItems = "center";

    const label = document.createElement("span");
    label.textContent = item.label;
    label.style.color = "var(--text-secondary)";
    label.style.fontSize = "0.875rem";

    const value = document.createElement("span");
    value.textContent = item.value;
    value.style.fontWeight = "600";
    value.style.fontSize = "0.875rem";
    value.style.color = "var(--text-primary)";

    row.appendChild(label);
    row.appendChild(value);
    return row;
  });

  return createCard({ title: "Quick Stats", content: list });
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Map a readiness level string to a human-readable label.
 */
function levelLabel(level: string): string {
  const labels: Record<string, string> = {
    not_ready: "Not Ready",
    almost_ready: "Almost Ready",
    ready: "Ready",
    exam_ready: "Exam Ready",
  };
  return labels[level] ?? level;
}

/**
 * Map a readiness level to a badge variant.
 */
function levelBadgeVariant(level: string): BadgeVariant {
  const variants: Record<string, BadgeVariant> = {
    not_ready: "danger",
    almost_ready: "warning",
    ready: "info",
    exam_ready: "success",
  };
  return variants[level] ?? "neutral";
}

/**
 * Map a readiness score to a CSS color for the gauge fill.
 *
 *   < 40  → red (--color-error)
 *   40–70 → orange (--color-warning)
 *   70–85 → blue (--accent-primary)
 *   > 85  → green (--color-success)
 */
function readinessColor(score: number): string {
  if (score < 40) return "var(--color-error)";
  if (score < 70) return "var(--color-warning)";
  if (score <= 85) return "var(--accent-primary)";
  return "var(--color-success)";
}
