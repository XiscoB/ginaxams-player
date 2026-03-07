/**
 * Badge Component — Small status label
 *
 * Used for difficulty indicators, trap levels, weakness scores.
 * Purely visual — no domain imports.
 */

/** Available badge visual variants */
export type BadgeVariant =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info";

export interface BadgeOptions {
  /** Text displayed inside the badge */
  readonly label: string;
  /** Visual variant controlling color scheme */
  readonly variant: BadgeVariant;
  /** Optional extra CSS class */
  readonly className?: string;
}

/**
 * Creates a badge element.
 *
 * @param label - Badge text
 * @param variant - Visual variant
 * @returns A styled badge HTMLElement
 */
export function createBadge(label: string, variant: BadgeVariant): HTMLElement {
  const badge = document.createElement("span");
  badge.className = `gx-badge gx-badge--${variant}`;
  badge.textContent = label;
  return badge;
}
