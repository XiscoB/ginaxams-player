/**
 * ViewStatus — Loading indicator and error state helpers (Phase 17)
 *
 * Provides small DOM-building functions for:
 * - Loading spinner/message shown while dashboard data loads
 * - Error state with "Reload" button for graceful failure recovery
 *
 * These are pure DOM-builders (no side effects beyond creating elements).
 * Translations are injected via the optional T parameter.
 */

import type { Translations } from "../../i18n/index.js";

// ============================================================================
// Loading Indicator
// ============================================================================

export interface LoadingIndicatorOptions {
  /** Message to display, e.g. "Loading insights…" */
  message: string;
}

/**
 * Create a simple loading indicator element.
 *
 * @returns An HTMLElement showing the loading message
 */
export function createLoadingIndicator(
  opts: LoadingIndicatorOptions,
): HTMLElement {
  const container = document.createElement("div");
  container.className = "view-loading";
  container.setAttribute("role", "status");
  container.setAttribute("aria-live", "polite");
  container.style.textAlign = "center";
  container.style.padding = "48px 16px";
  container.style.color = "var(--text-secondary, #999)";

  const msg = document.createElement("p");
  msg.textContent = opts.message;
  msg.style.fontSize = "1rem";
  container.appendChild(msg);

  return container;
}

// ============================================================================
// Error State
// ============================================================================

export interface ErrorStateOptions {
  /** Title text, e.g. "Something went wrong." */
  title?: string;
  /** Label for the reload button */
  reloadLabel?: string;
  /** Callback when the Reload button is clicked */
  onReload: () => void;
}

/**
 * Create an error state element with a Reload button.
 *
 * @returns An HTMLElement showing the error UI
 */
export function createErrorState(opts: ErrorStateOptions): HTMLElement {
  const container = document.createElement("div");
  container.className = "view-error";
  container.setAttribute("role", "alert");
  container.style.textAlign = "center";
  container.style.padding = "48px 16px";

  const title = document.createElement("h3");
  title.textContent = opts.title ?? "Something went wrong.";
  title.style.color = "var(--color-error, #ff4757)";
  title.style.marginBottom = "16px";
  container.appendChild(title);

  const btn = document.createElement("button");
  btn.textContent = opts.reloadLabel ?? "Reload";
  btn.className = "reload-btn";
  btn.style.padding = "8px 24px";
  btn.style.fontSize = "0.95rem";
  btn.style.cursor = "pointer";
  btn.style.border = "1px solid var(--accent-primary, #00d4ff)";
  btn.style.borderRadius = "6px";
  btn.style.background = "var(--bg-card, rgba(30,30,50,0.4))";
  btn.style.color = "var(--accent-primary, #00d4ff)";
  btn.addEventListener("click", opts.onReload);
  container.appendChild(btn);

  return container;
}

// ============================================================================
// Convenience: build loading/error from Translations
// ============================================================================

/**
 * Create a loading indicator for a specific view, using translations.
 */
export function createViewLoading(
  messageKey: "loadingInsights" | "loadingTelemetry",
  T?: Translations,
): HTMLElement {
  const fallbacks: Record<string, string> = {
    loadingInsights: "Loading insights…",
    loadingTelemetry: "Loading telemetry…",
  };
  return createLoadingIndicator({
    message: T?.[messageKey] ?? fallbacks[messageKey],
  });
}

/**
 * Create an error state using translations, with a reload callback.
 */
export function createViewError(
  onReload: () => void,
  T?: Translations,
): HTMLElement {
  return createErrorState({
    title: T?.errorGenericTitle ?? "Something went wrong.",
    reloadLabel: T?.errorReload ?? "Reload",
    onReload,
  });
}
