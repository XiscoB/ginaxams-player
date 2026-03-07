/**
 * UI Views — Barrel export
 *
 * Re-exports all view render functions and helpers.
 */

export { renderHomeView } from "./HomeView.js";
export { renderInsightsView } from "./InsightsView.js";
export { buildRecommendation } from "./home/buildRecommendation.js";
export type { Recommendation } from "./home/buildRecommendation.js";
export { computeQuickStats } from "./home/computeQuickStats.js";
export type { QuickStats } from "./home/computeQuickStats.js";

// Insights helpers (pure functions for testing/reuse)
export {
  sortCategoryMasteryByWeakness,
  countQuestionsPerCategory,
  getWeakQuestionsSorted,
  filterByCategory,
  getTrapQuestions,
  computeDifficultyPercentages,
  truncateText,
} from "./insights/insightsHelpers.js";
