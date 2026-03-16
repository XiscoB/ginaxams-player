/**
 * Keyboard Shortcuts — Desktop keyboard navigation for practice mode
 *
 * Provides keyboard shortcuts:
 *   1–4  → select answer
 *   Enter → submit/confirm answer
 *   N    → next question
 *   P    → previous question
 *   F    → flag/unflag question
 *
 * Shortcuts are disabled on touch-only devices and when focused in inputs.
 *
 * Returns a cleanup function to remove the event listener.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Callback configuration for keyboard shortcuts.
 */
export interface KeyboardShortcutCallbacks {
  onSelectAnswer: (index: number) => void;
  onNext: () => void;
  onPrevious: () => void;
  onFlag: () => void;
  onSubmitAnswer: () => void;
}

// ============================================================================
// Desktop Detection
// ============================================================================

/**
 * Check whether the device supports fine pointer (desktop/laptop).
 * Returns false for touch-only devices.
 *
 * Pure function wrapping matchMedia check.
 */
export function isDesktopDevice(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(pointer: fine)").matches;
}

// ============================================================================
// Input Guard
// ============================================================================

/**
 * Check whether an event target is an input element where shortcuts should be suppressed.
 */
function isInputFocused(event: KeyboardEvent): boolean {
  const target = event.target;
  if (!target || typeof target !== "object") return false;

  // Use tagName check for Node compatibility (instanceof requires DOM globals)
  const tagName = (target as HTMLElement).tagName;
  if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
    return true;
  }

  if (
    typeof (target as HTMLElement).isContentEditable !== "undefined" &&
    (target as HTMLElement).isContentEditable
  ) {
    return true;
  }

  return false;
}

// ============================================================================
// Shortcut Handler
// ============================================================================

/**
 * Build the keydown handler from callbacks.
 *
 * Pure function that returns the handler — testable without DOM.
 *
 * @param callbacks - Action callbacks
 * @param isActive - Function that returns true when shortcuts should be active
 * @returns The keydown event handler
 */
export function buildKeydownHandler(
  callbacks: KeyboardShortcutCallbacks,
  isActive: () => boolean,
): (event: KeyboardEvent) => void {
  return (event: KeyboardEvent) => {
    // Guard: not active (e.g. no attempt in progress)
    if (!isActive()) return;

    // Guard: focused in an input
    if (isInputFocused(event)) return;

    switch (event.key) {
      case "1":
        event.preventDefault();
        callbacks.onSelectAnswer(0);
        break;
      case "2":
        event.preventDefault();
        callbacks.onSelectAnswer(1);
        break;
      case "3":
        event.preventDefault();
        callbacks.onSelectAnswer(2);
        break;
      case "4":
        event.preventDefault();
        callbacks.onSelectAnswer(3);
        break;
      case "Enter":
        event.preventDefault();
        callbacks.onSubmitAnswer();
        break;
      case "n":
      case "N":
        event.preventDefault();
        callbacks.onNext();
        break;
      case "p":
      case "P":
        event.preventDefault();
        callbacks.onPrevious();
        break;
      case "f":
      case "F":
        event.preventDefault();
        callbacks.onFlag();
        break;
      default:
        // Unhandled key — do nothing
        break;
    }
  };
}

// ============================================================================
// Attach / Detach
// ============================================================================

/**
 * Attach keyboard shortcuts to the document.
 *
 * Returns a cleanup function to remove the listener.
 * Does nothing on non-desktop devices.
 *
 * @param callbacks - Action callbacks
 * @param isActive - Function that returns true when shortcuts should be active
 * @returns Cleanup function (call to remove listener)
 */
export function attachKeyboardShortcuts(
  callbacks: KeyboardShortcutCallbacks,
  isActive: () => boolean,
): () => void {
  // Skip on non-desktop devices
  if (!isDesktopDevice()) {
    return () => {};
  }

  const handler = buildKeydownHandler(callbacks, isActive);
  document.addEventListener("keydown", handler);

  return () => {
    document.removeEventListener("keydown", handler);
  };
}
