/**
 * computeQuickStats — Home Dashboard helper
 *
 * Derives quick summary statistics from mastery and attempt data.
 * Pure presentation logic — no domain imports.
 */

import type { HomeViewData } from "../../../application/viewState.js";

/**
 * Quick stats displayed on the home dashboard.
 */
export interface QuickStats {
  /** Number of categories with mastery level "weak" */
  readonly weakCategories: number;
  /** Score (percentage) of the most recent simulacro, or null if none */
  readonly lastSimulacroScore: number | null;
  /** Number of questions answered today across all attempts */
  readonly questionsSeenToday: number;
}

/**
 * Compute quick stats from home dashboard data.
 *
 * @param data - Home view data from the controller
 * @returns QuickStats
 */
export function computeQuickStats(data: HomeViewData): QuickStats {
  // Weak categories: mastery level === "weak"
  const weakCategories = data.categoryMastery.filter(
    (cm) => cm.level === "weak",
  ).length;

  // Last simulacro score: most recent simulacro attempt with a result
  const simulacros = data.attempts
    .filter((a) => a.type === "simulacro" && a.result !== undefined)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const lastSimulacroScore =
    simulacros.length > 0 ? (simulacros[0].result?.percentage ?? null) : null;

  // Questions seen today: count questions in attempts created today
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayISO = todayStart.toISOString();

  let questionsSeenToday = 0;
  for (const attempt of data.attempts) {
    if (attempt.createdAt >= todayISO && attempt.result) {
      questionsSeenToday +=
        attempt.result.correct +
        attempt.result.wrong +
        attempt.result.blank;
    }
  }

  return {
    weakCategories,
    lastSimulacroScore,
    questionsSeenToday,
  };
}
