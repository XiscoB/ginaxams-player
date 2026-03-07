/**
 * InsightsView — Training Analytics Dashboard (Phase 12)
 *
 * Composes UI primitives to display:
 * - Category Mastery Dashboard (with drill-down)
 * - Weak Questions Screen (with expandable feedback + category filter)
 * - Trap Question Report
 * - Progress Timeline (with sparkline chart)
 * - Difficulty Distribution (with optional drill-down)
 *
 * Data is fetched from ExamLibraryController.getInsightsData().
 * No domain imports — only view helpers and UI primitives.
 *
 * Insights is read-only. It visualizes existing training data without
 * modifying weakness formulas, telemetry, or scoring logic.
 */

import type { ExamLibraryController } from "../../application/examLibraryController.js";
import type { Translations } from "../../i18n/index.js";

import { createSection } from "../components/Section.js";
import { createStack } from "../components/Stack.js";

import { buildCategoryMasteryView } from "./insights/buildCategoryMasteryView.js";
import { buildWeakQuestionsView } from "./insights/buildWeakQuestionsView.js";
import { buildTrapQuestionsView } from "./insights/buildTrapQuestionsView.js";
import { buildProgressView } from "./insights/buildProgressView.js";
import { buildDifficultyDistributionView } from "./insights/buildDifficultyDistributionView.js";

// ============================================================================
// InsightsView
// ============================================================================

/**
 * Render the Insights view.
 *
 * This is an async function because it fetches data from the controller.
 * Returns a fully composed HTMLElement ready for mounting.
 *
 * @param controller - The ExamLibraryController instance
 * @param callbacks - Optional navigation callbacks
 * @param T - Translations object for i18n
 * @returns The insights dashboard HTMLElement
 */
export async function renderInsightsView(
  controller: ExamLibraryController,
  callbacks?: {
    onAttemptClick?: (attemptId: string) => void;
  },
  T?: Translations,
): Promise<HTMLElement> {
  const data = await controller.getInsightsData();

  const categoryMasteryCard = buildCategoryMasteryView(data, T);
  const weakQuestionsCard = buildWeakQuestionsView(data, T);
  const trapQuestionsCard = buildTrapQuestionsView(data, T);
  const progressCard = buildProgressView(data, callbacks?.onAttemptClick, T);
  const difficultyCard = buildDifficultyDistributionView(data, T);

  return createSection({
    title: T?.insightsTitle ?? "Insights",
    description:
      T?.insightsDescription ?? "Training analytics and diagnostic views.",
    content: createStack({
      direction: "column",
      gap: 16,
      children: [
        categoryMasteryCard,
        weakQuestionsCard,
        trapQuestionsCard,
        progressCard,
        difficultyCard,
      ],
    }),
  });
}
