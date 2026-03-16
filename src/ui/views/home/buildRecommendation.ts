/**
 * buildRecommendation — Home Dashboard helper
 *
 * Generates a study recommendation based on readiness, mastery,
 * and recent attempt data. Pure presentation logic — no domain imports.
 */

import type { HomeViewData } from "../../../application/viewState.js";

/**
 * A study recommendation for the home dashboard.
 */
export interface Recommendation {
  /** Main message text */
  readonly message: string;
  /** Button label for the suggested action */
  readonly actionLabel: string;
  /** Readiness level label for display */
  readonly level: "not_ready" | "almost_ready" | "ready" | "exam_ready";
  /** Callback for the recommended action (may be a placeholder) */
  readonly action: () => void;
}

/**
 * Build a study recommendation from home dashboard data.
 *
 * Decision table (based on readiness score):
 *   < 40  → "Review weak topics"
 *   40–70 → "Mixed training"
 *   70–85 → "Take a simulacro"
 *   > 85  → "Ready for exam"
 *
 * @param data - Home view data from the controller
 * @param callbacks - Optional action callbacks (placeholders if not provided)
 * @returns A Recommendation object
 */
export function buildRecommendation(
  data: HomeViewData,
  callbacks?: {
    startReview?: () => void;
    startSimulacro?: () => void;
  },
): Recommendation {
  const score = data.readiness.score;
  const weakCategories = data.categoryMastery.filter(
    (cm) => cm.level === "weak",
  );

  const noop = (): void => {};

  if (score < 40) {
    const weakCount = weakCategories.length;
    return {
      message:
        weakCount > 0
          ? `You have ${weakCount} weak ${weakCount === 1 ? "category" : "categories"}. Focus on reviewing your weakest topics to build a stronger foundation.`
          : "Your readiness score is low. Start with a review session to identify weak areas.",
      actionLabel: "Start Review",
      level: "not_ready",
      action: callbacks?.startReview ?? noop,
    };
  }

  if (score < 70) {
    return {
      message:
        "You're making progress. Mix review sessions with practice simulacros to strengthen your knowledge.",
      actionLabel: "Start Review",
      level: "almost_ready",
      action: callbacks?.startReview ?? noop,
    };
  }

  if (score <= 85) {
    return {
      message:
        "You're looking strong. Take a simulacro to test yourself under exam conditions.",
      actionLabel: "Start Simulacro",
      level: "ready",
      action: callbacks?.startSimulacro ?? noop,
    };
  }

  return {
    message:
      "Excellent preparation! You're ready for the exam. Keep practicing to maintain your edge.",
    actionLabel: "Start Simulacro",
    level: "exam_ready",
    action: callbacks?.startSimulacro ?? noop,
  };
}
