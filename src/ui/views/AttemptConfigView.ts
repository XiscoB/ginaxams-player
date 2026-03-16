/**
 * AttemptConfigView — Mode selection screen rendering.
 *
 * Creates and manages the attempt configuration screen where
 * users choose between Free, Simulacro, and Review modes.
 *
 * Pure DOM creation — no business logic.
 */

import type { Translations } from "../../i18n/index.js";

export interface AttemptConfigCallbacks {
  onStartMode: (mode: "free" | "simulacro" | "review") => void;
  onBack: () => void;
}

/**
 * Create the attempt configuration screen element.
 * Appends it to document.body and returns it.
 */
export function createAttemptConfigScreen(
  T: Translations,
  callbacks: AttemptConfigCallbacks,
): HTMLElement {
  const screen = document.createElement("div");
  screen.id = "attemptConfigScreen";
  screen.className = "screen hidden";

  screen.innerHTML = `
    <div class="container">
      <h2>${T.selectMode || "Select Practice Mode"}</h2>
      <div class="mode-cards-container">
        <div class="mode-card mode-card--free">
          <div class="mode-card__header">
            <span class="mode-card__icon">📚</span>
            <span class="mode-card__title">${T.freeMode || "Free Mode"}</span>
          </div>
          <div class="mode-card__desc">
            <span>${T.freeModeDesc || "Practice at your own pace with full exam"}</span>
            <span style="color: var(--text-muted); font-size: 0.85em;">${T.modeFreeDescription || "No telemetry tracking"}</span>
          </div>
          <div class="mode-card__actions">
            <button id="btnFreeMode" class="btn btn--primary">${T.modeStartButton || "Start"}</button>
          </div>
        </div>
        <div class="mode-card mode-card--simulacro">
          <div class="mode-card__header">
            <span class="mode-card__icon">⏱️</span>
            <span class="mode-card__title">${T.simulacroMode || "Simulacro"}</span>
          </div>
          <div class="mode-card__desc">
            <span>${T.simulacroModeDesc || "Timed exam simulation"}</span>
            <span style="color: var(--text-muted); font-size: 0.85em;">${T.modeSimulacroDescription || "Configurable timer"}</span>
          </div>
          <div class="mode-card__config" style="margin-top: var(--space-sm);">
            <label style="display: block; margin-bottom: var(--space-xs); color: var(--text-secondary); font-size: 0.85em;">${T.timerConfig || "Timer Duration"}</label>
            <select id="simulacroTimerSelect" class="config-select" style="width: 100%; padding: 8px; border-radius: var(--radius-sm); background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border-color); font-size: 0.9em; margin-bottom: var(--space-sm);">
              <option value="0">${T.timerNoLimit || "No timer"}</option>
              <option value="1800000">${T.timer30 || "30 minutes"}</option>
              <option value="3600000" selected>${T.timer60 || "60 minutes"}</option>
              <option value="5400000">${T.timer90 || "90 minutes"}</option>
            </select>
            <label style="display: flex; align-items: center; gap: var(--space-xs); color: var(--text-secondary); font-size: 0.85em; cursor: pointer;">
              <input type="checkbox" id="simulacroShowExplanations" />
              ${T.showFeedbackToggle || "Show feedback during exam"}
            </label>
          </div>
          <div class="mode-card__actions">
            <button id="btnSimulacroMode" class="btn btn--primary">${T.modeStartButton || "Start"}</button>
          </div>
        </div>
        <div class="mode-card mode-card--review">
          <div class="mode-card__header">
            <span class="mode-card__icon">🎯</span>
            <span class="mode-card__title">${T.reviewMode || "Review Mode"}</span>
          </div>
          <div class="mode-card__desc">
            <span>${T.reviewModeDesc || "Focus on weak questions"}</span>
            <span style="color: var(--text-muted); font-size: 0.85em;">${T.modeReviewDescription || "Adaptive practice"}</span>
          </div>
          <div class="mode-card__actions">
            <button id="btnReviewMode" class="btn btn--primary">${T.modeStartButton || "Start"}</button>
          </div>
        </div>
      </div>
      <button id="btnBackToLibrary" class="btn btn--secondary" style="width:100%;">${T.back || "Back"}</button>
    </div>
  `;

  document.body.appendChild(screen);

  // Bind mode selection buttons
  screen
    .querySelector("#btnFreeMode")
    ?.addEventListener("click", () => callbacks.onStartMode("free"));
  screen
    .querySelector("#btnSimulacroMode")
    ?.addEventListener("click", () => callbacks.onStartMode("simulacro"));
  screen
    .querySelector("#btnReviewMode")
    ?.addEventListener("click", () => callbacks.onStartMode("review"));
  screen
    .querySelector("#btnBackToLibrary")
    ?.addEventListener("click", () => callbacks.onBack());

  return screen;
}

/**
 * Show the attempt config screen and set the exam title.
 */
export function showAttemptConfigScreen(examTitle: string): void {
  const screen = document.getElementById("attemptConfigScreen");
  if (screen) screen.classList.remove("hidden");

  const titleEl = document.getElementById("examTitle");
  if (titleEl) titleEl.textContent = examTitle;
}

/**
 * Remove the attempt config screen from DOM (for language change recreation).
 */
export function removeAttemptConfigScreen(): void {
  document.getElementById("attemptConfigScreen")?.remove();
}
