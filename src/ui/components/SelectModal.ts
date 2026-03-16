/**
 * SelectModal — Styled replacement for prompt()-based selection
 *
 * Purely visual — no domain imports.
 * Shows a list of options as clickable buttons.
 * Returns Promise<T | null> — the selected item's value, or null if cancelled.
 */

export interface SelectModalOption<T> {
  /** Display label */
  readonly label: string;
  /** Returned value when selected */
  readonly value: T;
  /** Optional icon/emoji prefix */
  readonly icon?: string;
}

export interface SelectModalOptions<T> {
  /** Modal title */
  readonly title: string;
  /** Optional description */
  readonly message?: string;
  /** Selectable items */
  readonly options: ReadonlyArray<SelectModalOption<T>>;
  /** Label for cancel button */
  readonly cancelLabel: string;
  /** Icon emoji above title */
  readonly icon?: string;
}

/**
 * Show a styled selection modal.
 * Resolves with the selected option's value, or null if cancelled.
 */
export function showSelectModal<T>(
  options: SelectModalOptions<T>,
): Promise<T | null> {
  return new Promise((resolve) => {
    const color = "var(--accent-primary, #00d4ff)";
    const border = "rgba(0, 212, 255, 0.3)";
    const shadow = "0 16px 48px rgba(0, 212, 255, 0.15)";

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
      max-height: 80vh;
      display: flex; flex-direction: column;
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
      color: ${color}; margin-bottom: 12px;
      font-size: 1.2em; font-weight: 700;
    `;
    title.textContent = options.title;
    card.appendChild(title);

    // --- Message ---
    if (options.message) {
      const msg = document.createElement("p");
      msg.style.cssText = `
        color: var(--text-secondary, #a0a0b0);
        font-size: 0.9em; margin-bottom: 16px; line-height: 1.5;
      `;
      msg.textContent = options.message;
      card.appendChild(msg);
    }

    // --- Options list (scrollable) ---
    const list = document.createElement("div");
    list.style.cssText = `
      display: flex; flex-direction: column; gap: 6px;
      margin-bottom: 16px;
      overflow-y: auto;
      flex: 1;
      min-height: 0;
    `;

    // --- Cleanup helper ---
    function close(value: T | null): void {
      document.removeEventListener("keydown", onKeydown);
      overlay.style.opacity = "0";
      card.style.transform = "scale(0.95)";
      card.style.opacity = "0";
      setTimeout(() => {
        overlay.remove();
        resolve(value);
      }, 200);
    }

    for (const opt of options.options) {
      const btn = document.createElement("button");
      btn.style.cssText = `
        background: var(--bg-secondary, #1a1a2e);
        color: var(--text-primary, #fff);
        border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
        padding: 12px 16px;
        border-radius: var(--radius-md, 10px);
        font-size: 0.95em;
        cursor: pointer; width: 100%;
        text-align: left;
        transition: border-color 0.15s ease, background 0.15s ease;
      `;
      btn.textContent = opt.icon ? `${opt.icon} ${opt.label}` : opt.label;
      btn.addEventListener("mouseenter", () => {
        btn.style.borderColor = color;
        btn.style.background = "rgba(0, 212, 255, 0.08)";
      });
      btn.addEventListener("mouseleave", () => {
        btn.style.borderColor = "var(--border-color, rgba(255, 255, 255, 0.1))";
        btn.style.background = "var(--bg-secondary, #1a1a2e)";
      });
      btn.addEventListener("click", () => close(opt.value));
      list.appendChild(btn);
    }
    card.appendChild(list);

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
    card.appendChild(cancelBtn);

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // Click backdrop to cancel
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close(null);
    });

    // Escape key to cancel
    function onKeydown(e: KeyboardEvent): void {
      if (e.key === "Escape") close(null);
    }
    document.addEventListener("keydown", onKeydown);

    // Animate in
    requestAnimationFrame(() => {
      overlay.style.opacity = "1";
      card.style.transform = "scale(1)";
      card.style.opacity = "1";
    });
  });
}
