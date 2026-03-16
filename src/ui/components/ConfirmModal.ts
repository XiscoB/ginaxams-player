/**
 * ConfirmModal — Reusable custom modal replacing native confirm() and alert()
 *
 * Purely visual — no domain imports.
 * Creates a styled overlay with configurable title, message, and buttons.
 * Returns a Promise<boolean> for confirm-style, or Promise<void> for alert-style.
 */

export type ConfirmModalVariant = "danger" | "info" | "warning" | "success";

export interface ConfirmModalOptions {
  /** Modal title */
  readonly title: string;
  /** Message body */
  readonly message: string;
  /** Label for primary action button */
  readonly confirmLabel: string;
  /** Label for cancel button (omit for alert-style with only one button) */
  readonly cancelLabel?: string;
  /** Visual variant — affects accent color */
  readonly variant?: ConfirmModalVariant;
  /** Icon emoji displayed above title */
  readonly icon?: string;
  /** If true, requires a second click to confirm (double-check) */
  readonly doubleConfirm?: boolean;
  /** Label for the second confirmation step */
  readonly doubleConfirmLabel?: string;
}

const VARIANT_COLORS: Record<ConfirmModalVariant, string> = {
  danger: "var(--color-error, #ff4757)",
  warning: "var(--color-warning, #ffd700)",
  info: "var(--accent-primary, #00d4ff)",
  success: "var(--color-success, #00ff88)",
};

const VARIANT_SHADOWS: Record<ConfirmModalVariant, string> = {
  danger: "0 16px 48px rgba(255, 71, 87, 0.2)",
  warning: "0 16px 48px rgba(255, 215, 0, 0.15)",
  info: "0 16px 48px rgba(0, 212, 255, 0.15)",
  success: "0 16px 48px rgba(0, 255, 136, 0.15)",
};

const VARIANT_BORDERS: Record<ConfirmModalVariant, string> = {
  danger: "var(--color-error-border, rgba(255, 71, 87, 0.4))",
  warning: "var(--color-warning-border, rgba(255, 215, 0, 0.4))",
  info: "rgba(0, 212, 255, 0.3)",
  success: "var(--color-success-border, rgba(0, 255, 136, 0.4))",
};

/**
 * Show a custom styled confirm/alert modal.
 * Resolves `true` if confirmed, `false` if cancelled.
 * For alert-style (no cancelLabel), always resolves `true` when dismissed.
 */
export function showConfirmModal(
  options: ConfirmModalOptions,
): Promise<boolean> {
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
      color: ${color}; margin-bottom: 12px;
      font-size: 1.2em; font-weight: 700;
    `;
    title.textContent = options.title;
    card.appendChild(title);

    // --- Message ---
    const msg = document.createElement("p");
    msg.style.cssText = `
      color: var(--text-secondary, #a0a0b0);
      font-size: 0.9em; margin-bottom: 24px; line-height: 1.5;
    `;
    msg.textContent = options.message;
    card.appendChild(msg);

    // --- Buttons container ---
    const buttons = document.createElement("div");
    buttons.style.cssText = "display: flex; flex-direction: column; gap: 8px;";

    // --- Cleanup helper ---
    function close(result: boolean): void {
      overlay.style.opacity = "0";
      card.style.transform = "scale(0.95)";
      card.style.opacity = "0";
      setTimeout(() => {
        overlay.remove();
        resolve(result);
      }, 200);
    }

    // --- Primary / Confirm button ---
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

    if (options.doubleConfirm) {
      // First click: show second confirmation
      const secondBtn = document.createElement("button");
      secondBtn.style.cssText = confirmBtn.style.cssText;
      secondBtn.textContent =
        options.doubleConfirmLabel ?? options.confirmLabel;
      secondBtn.style.display = "none";
      secondBtn.addEventListener("click", () => close(true));

      confirmBtn.addEventListener("click", () => {
        confirmBtn.style.display = "none";
        secondBtn.style.display = "";
      });

      buttons.appendChild(confirmBtn);
      buttons.appendChild(secondBtn);
    } else {
      confirmBtn.addEventListener("click", () => close(true));
      buttons.appendChild(confirmBtn);
    }

    // --- Cancel button (only for confirm-style) ---
    if (options.cancelLabel) {
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
      cancelBtn.addEventListener("click", () => close(false));
      buttons.appendChild(cancelBtn);
    }

    card.appendChild(buttons);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // Click on overlay backdrop to cancel (only if cancelLabel exists)
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close(!!!options.cancelLabel);
    });

    // Escape key to cancel
    function onKeydown(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        document.removeEventListener("keydown", onKeydown);
        close(!!!options.cancelLabel);
      }
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

/**
 * Show a styled alert (info) modal. Single "OK" button.
 */
export function showAlertModal(
  title: string,
  message: string,
  variant: ConfirmModalVariant = "info",
  icon?: string,
): Promise<void> {
  return showConfirmModal({
    title,
    message,
    confirmLabel: "OK",
    variant,
    icon,
  }).then(() => {});
}
