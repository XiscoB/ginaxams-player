/**
 * Score Presentation — UI/presentation layer for score visualization
 *
 * This module contains presentation-only logic that maps domain
 * score categories to visual representations (colors, CSS values).
 *
 * Domain classification lives in domain/scoring.ts (getScoreCategory).
 * This module only handles the visual mapping.
 */

/**
 * Score category type (mirrors domain classification output)
 */
export type ScoreCategory = "good" | "medium" | "bad";

/**
 * Get the CSS color associated with a score category.
 *
 * @param category - The score category from domain/scoring.ts
 * @returns CSS color value for rendering
 */
export function getScoreColor(category: ScoreCategory): string {
  const colors: Record<ScoreCategory, string> = {
    good: "var(--accent-secondary)", // #00ff88
    medium: "#ffd700",
    bad: "#ff6b6b",
  };
  return colors[category];
}
