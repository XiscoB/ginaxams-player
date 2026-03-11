/**
 * InputModal — Styled replacement for native prompt()
 *
 * Purely visual — no domain imports.
 * Creates a styled overlay with a text input field.
 * Returns Promise<string | null> — null if cancelled.
 */

export type InputModalVariant = "info" | "warning";

export interface InputModalOptions {
  /** Modal title */
  readonly title: string;
  /** Label above the input field */
  readonly label: string;
  /** Placeholder text for the input */
  readonly placeholder?: string;
  /** Pre-filled value */
  readonly defaultValue?: string;
  /** Label for primary action button */
  readonly confirmLabel: string;
  /** Label for cancel button */
  readonly cancelLabel: string;
  /** Visual variant — affects accent color */
  readonly variant?: InputModalVariant;
  /** Icon emoji displayed above title */
  readonly icon?: string;
}

const VARIANT_COLORS: Record<InputModalVariant, string> = {
  info: "var(--accent-primary, #00d4ff)",
  warning: "var(--color-warning, #ffd700)",
};

const VARIANT_SHADOWS: Record<InputModalVariant, string> = {
  info: "0 16px 48px rgba(0, 212, 255, 0.15)",
  warning: "0 16px 48px rgba(255, 215, 0, 0.15)",
};

const VARIANT_BORDERS: Record<InputModalVariant, string> = {
  info: "rgba(0, 212, 255, 0.3)",
  warning: "var(--color-warning-border, rgba(255, 215, 0, 0.4))",
};

/**
 * Show a styled input prompt modal.
 * Resolves with the trimmed input string, or null if cancelled / empty.
 */
export function showInputModal(
  options: InputModalOptions,
): Promise<string | null> {
  return new Promise((resolve) => {
    const variant = options.variant ?? "info";
    const color = VARIANT_COLORS[variant];
    const shadow = VARIANT_SHADOWS[variant];
    const border = VARIANT_BORDERS[variant];

    // --- Overlay ---
    const overlay = document.createElement("div");
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 30000;
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(10px);
      display: flex; align-items: center; justify-content: center;
      padding: 20px;
      opacity: 0; transition: opacity 0.2s ease;
    `;

    // --- Card ---
    const card = document.createElement("div");
    card.style.cssText = `
      background: var(--bg-primary, #0f0f1a);
      border: 1px solid ${border};
      border-radius: var(--radius-lg, 16px);
      padding: 32px;
      max-width: 440px;
      width: 100%;
      text-align: center;
      box-shadow: ${shadow};
      transform: scale(0.95); opacity: 0;
      transition: transform 0.2s ease, opacity 0.2s ease;
    `;

    // --- Icon ---
    if (options.icon) {
      const icon = document.createElement("div");
      icon.style.cssText = "font-size: 2.5em; margin-bottom: 12px;";
      icon.textContent = options.icon;
      card.appendChild(icon);
    }

    // --- Title ---
    const title = document.createElement("h2");
    title.style.cssText = `
      color: ${color}; margin-bottom: 16px;
      font-size: 1.2em; font-weight: 700;
    `;
    title.textContent = options.title;
    card.appendChild(title);

    // --- Label ---
    const label = document.createElement("label");
    label.style.cssText = `
      display: block; text-align: left;
      color: var(--text-secondary, #a0a0b0);
      font-size: 0.85em; margin-bottom: 6px;
    `;
    label.textContent = options.label;
    card.appendChild(label);

    // --- Input ---
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = options.placeholder ?? "";
    input.value = options.defaultValue ?? "";
    input.style.cssText = `
      width: 100%; box-sizing: border-box;
      background: var(--bg-secondary, #1a1a2e);
      color: var(--text-primary, #fff);
      border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
      border-radius: var(--radius-md, 10px);
      padding: 12px 14px;
      font-size: 1em;
      margin-bottom: 20px;
      outline: none;
      transition: border-color 0.15s ease;
    `;
    input.addEventListener("focus", () => {
      input.style.borderColor = color;
    });
    input.addEventListener("blur", () => {
      input.style.borderColor = "var(--border-color, rgba(255, 255, 255, 0.1))";
    });
    card.appendChild(input);

    // --- Buttons container ---
    const buttons = document.createElement("div");
    buttons.style.cssText = "display: flex; flex-direction: column; gap: 8px;";

    // --- Cleanup helper ---
    function close(value: string | null): void {
      document.removeEventListener("keydown", onKeydown);
      overlay.style.opacity = "0";
      card.style.transform = "scale(0.95)";
      card.style.opacity = "0";
      setTimeout(() => {
        overlay.remove();
        resolve(value);
      }, 200);
    }

    // --- Confirm button ---
    const confirmBtn = document.createElement("button");
    confirmBtn.style.cssText = `
      background: ${color};
      color: ${variant === "warning" ? "#000" : "#fff"};
      border: none; padding: 12px 28px;
      border-radius: var(--radius-md, 10px);
      font-size: 1em; font-weight: 600;
      cursor: pointer; width: 100%;
      transition: opacity 0.15s ease;
    `;
    confirmBtn.textContent = options.confirmLabel;
    confirmBtn.addEventListener("mouseenter", () => {
      confirmBtn.style.opacity = "0.85";
    });
    confirmBtn.addEventListener("mouseleave", () => {
      confirmBtn.style.opacity = "1";
    });
    confirmBtn.addEventListener("click", () => {
      const val = input.value.trim();
      close(val.length > 0 ? val : null);
    });
    buttons.appendChild(confirmBtn);

    // --- Cancel button ---
    const cancelBtn = document.createElement("button");
    cancelBtn.style.cssText = `
      background: transparent;
      color: var(--text-secondary, #a0a0b0);
      border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
      padding: 10px 28px;
      border-radius: var(--radius-md, 10px);
      font-size: 0.9em; cursor: pointer; width: 100%;
      transition: border-color 0.15s ease, color 0.15s ease;
    `;
    cancelBtn.textContent = options.cancelLabel;
    cancelBtn.addEventListener("mouseenter", () => {
      cancelBtn.style.borderColor =
        "var(--border-hover, rgba(255,255,255,0.2))";
      cancelBtn.style.color = "var(--text-primary, #fff)";
    });
    cancelBtn.addEventListener("mouseleave", () => {
      cancelBtn.style.borderColor =
        "var(--border-color, rgba(255,255,255,0.1))";
      cancelBtn.style.color = "var(--text-secondary, #a0a0b0)";
    });
    cancelBtn.addEventListener("click", () => close(null));
    buttons.appendChild(cancelBtn);

    card.appendChild(buttons);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // Click backdrop to cancel
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close(null);
    });

    // Keyboard handling
    function onKeydown(e: KeyboardEvent): void {
      if (e.key === "Escape") close(null);
      if (e.key === "Enter") {
        const val = input.value.trim();
        close(val.length > 0 ? val : null);
      }
    }
    document.addEventListener("keydown", onKeydown);

    // Animate in & focus
    requestAnimationFrame(() => {
      overlay.style.opacity = "1";
      card.style.transform = "scale(1)";
      card.style.opacity = "1";
      input.focus();
      if (options.defaultValue) input.select();
    });
  });
}
