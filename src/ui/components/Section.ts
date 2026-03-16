/**
 * Section Component — Standardized screen section
 *
 * Provides a consistent title + optional description + content layout
 * wrapped inside a Card. Used across dashboard and insights screens.
 * Purely visual — no domain imports.
 */

import { createCard } from "./Card.js";

export interface SectionOptions {
  /** Section title displayed at the top */
  readonly title: string;
  /** Optional description shown below the title */
  readonly description?: string;
  /** Main content element */
  readonly content: HTMLElement;
  /** Optional extra CSS class */
  readonly className?: string;
}

/**
 * Creates a section element with title, optional description, and content.
 *
 * Internally wraps content in a Card component for consistent styling.
 *
 * @param options - Section configuration
 * @returns A styled section HTMLElement
 */
export function createSection(options: SectionOptions): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "gx-section";
  if (options.className) {
    wrapper.classList.add(options.className);
  }

  const titleEl = document.createElement("h2");
  titleEl.className = "gx-section__title";
  titleEl.textContent = options.title;
  wrapper.appendChild(titleEl);

  if (options.description) {
    const descEl = document.createElement("p");
    descEl.className = "gx-section__description";
    descEl.textContent = options.description;
    wrapper.appendChild(descEl);
  }

  const card = createCard({ content: options.content });
  wrapper.appendChild(card);

  return wrapper;
}
