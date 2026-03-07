/**
 * Stack Component — Flexbox layout helper
 *
 * Arranges child elements in a row or column with consistent spacing.
 * Purely visual — no domain imports.
 */

export interface StackOptions {
  /** Layout direction (defaults to "column") */
  readonly direction?: "row" | "column";
  /** Gap between children in pixels (defaults to 8) */
  readonly gap?: number;
  /** Child elements to render in order */
  readonly children: ReadonlyArray<HTMLElement>;
  /** Optional alignment on the cross axis */
  readonly align?: "start" | "center" | "end" | "stretch";
  /** Optional extra CSS class */
  readonly className?: string;
}

/**
 * Creates a flexbox stack container.
 *
 * @param options - Stack configuration
 * @returns A styled stack HTMLElement
 */
export function createStack(options: StackOptions): HTMLElement {
  const direction = options.direction ?? "column";
  const gap = options.gap ?? 8;

  const container = document.createElement("div");
  container.className = "gx-stack";
  if (options.className) {
    container.classList.add(options.className);
  }

  container.style.display = "flex";
  container.style.flexDirection = direction;
  container.style.gap = `${gap}px`;

  if (options.align) {
    container.style.alignItems = options.align;
  }

  for (const child of options.children) {
    container.appendChild(child);
  }

  return container;
}
