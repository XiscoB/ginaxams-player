/**
 * UI Views — Barrel export
 *
 * Re-exports all view render functions and helpers.
 */

export { renderHomeView } from "./HomeView.js";
export { buildRecommendation } from "./home/buildRecommendation.js";
export type { Recommendation } from "./home/buildRecommendation.js";
export { computeQuickStats } from "./home/computeQuickStats.js";
export type { QuickStats } from "./home/computeQuickStats.js";
