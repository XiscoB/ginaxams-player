/**
 * Button Component — Standardized button element
 *
 * Purely visual — no domain imports.
 */

/** Available button visual variants */
export type ButtonVariant = "primary" | "secondary" | "danger";

export interface ButtonOptions {
  /** Button label text */
  readonly label: string;
  /** Visual variant (defaults to "primary") */
  readonly variant?: ButtonVariant;
  /** Click handler */
  readonly onClick?: () => void;
  /** Whether the button is disabled */
  readonly disabled?: boolean;
  /** Optional extra CSS class */
  readonly className?: string;
}

/**
 * Creates a button element.
 *
 * @param options - Button configuration
 * @returns A styled button HTMLElement
 */
export function createButton(options: ButtonOptions): HTMLButtonElement {
  const variant = options.variant ?? "primary";
  const button = document.createElement("button");
  button.className = `gx-button gx-button--${variant}`;
  button.textContent = options.label;

  if (options.className) {
    button.classList.add(options.className);
  }

  if (options.disabled) {
    button.disabled = true;
  }

  if (options.onClick) {
    button.addEventListener("click", options.onClick);
  }

  return button;
}
