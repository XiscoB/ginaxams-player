/**
 * AttemptExecutionView — Practice screen rendering helpers.
 *
 * Manages the execution screen DOM: timer display, timer visibility.
 * The actual question rendering is handled by PracticeManager.
 *
 * Pure DOM manipulation — no business logic.
 */

import type { Translations } from "../../i18n/index.js";

/**
 * Show the execution screen and configure the timer area.
 */
export function showExecutionScreen(hasTimer: boolean): void {
  const practiceScreen = document.getElementById("practiceScreen");
  if (practiceScreen) practiceScreen.classList.remove("hidden");

  const timerArea = document.getElementById("simulacroTimerArea");
  if (timerArea) {
    if (hasTimer) {
      timerArea.classList.remove("hidden");
      timerArea.style.display = "flex";
    } else {
      timerArea.classList.add("hidden");
      timerArea.style.display = "none";
    }
  }
}

/**
 * Render the simulacro timer display with remaining milliseconds.
 */
export function renderTimer(remainingMs: number): void {
  const timerDisplay = document.getElementById("simulacroTimerDisplay");
  if (!timerDisplay) return;

  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  timerDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Update timer display and toggle button based on visibility state.
 */
export function updateTimerVisibility(visible: boolean, T: Translations): void {
  const timerDisplay = document.getElementById("simulacroTimerDisplay");
  const timerToggle = document.getElementById("timerToggleBtn");

  if (timerDisplay) {
    timerDisplay.style.visibility = visible ? "visible" : "hidden";
  }
  if (timerToggle) {
    timerToggle.textContent = visible
      ? T.hideTimer || "Hide Timer"
      : T.showTimer || "Show Timer";
  }
}
