/**
 * ProgressBar Component — Horizontal bar showing a percentage
 *
 * Used for category mastery bars, difficulty distribution.
 * Purely visual — no domain imports.
 */

export interface ProgressBarOptions {
  /** Percentage value (clamped to 0–100) */
  readonly percent: number;
  /** Optional label displayed next to or inside the bar */
  readonly label?: string;
  /** Optional variant for color coding */
  readonly variant?: "default" | "success" | "warning" | "danger";
  /** Optional extra CSS class */
  readonly className?: string;
}

/**
 * Creates a progress bar element.
 *
 * @param percent - Value 0–100
 * @returns A styled progress bar HTMLElement
 */
export function createProgressBar(percent: number): HTMLElement;
/**
 * Creates a progress bar element with options.
 *
 * @param options - Progress bar configuration
 * @returns A styled progress bar HTMLElement
 */
export function createProgressBar(options: ProgressBarOptions): HTMLElement;
export function createProgressBar(
  input: number | ProgressBarOptions,
): HTMLElement {
  const opts: ProgressBarOptions =
    typeof input === "number" ? { percent: input } : input;

  const clamped = Math.max(0, Math.min(100, opts.percent));
  const variant = opts.variant ?? "default";

  const container = document.createElement("div");
  container.className = `gx-progress`;
  if (opts.className) {
    container.classList.add(opts.className);
  }

  const track = document.createElement("div");
  track.className = "gx-progress__track";

  const fill = document.createElement("div");
  fill.className = `gx-progress__fill gx-progress__fill--${variant}`;
  fill.style.width = `${clamped}%`;

  track.appendChild(fill);
  container.appendChild(track);

  if (opts.label) {
    const labelEl = document.createElement("span");
    labelEl.className = "gx-progress__label";
    labelEl.textContent = opts.label;
    container.appendChild(labelEl);
  }

  return container;
}
