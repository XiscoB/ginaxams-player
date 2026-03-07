/**
 * HomeView — Placeholder home dashboard screen
 *
 * Skeleton view composing UI primitives.
 * No controller calls — purely presentation placeholder.
 */

import { createSection } from "../components/Section.js";
import { createStack } from "../components/Stack.js";
import { createCard } from "../components/Card.js";

/**
 * Renders the home dashboard view.
 *
 * Currently returns a placeholder layout using primitives.
 * Will be replaced with real dashboard content in Phase 11.
 *
 * @returns The home view HTMLElement
 */
export function renderHomeView(): HTMLElement {
  const placeholder = document.createElement("p");
  placeholder.textContent = "Placeholder dashboard content";
  placeholder.style.color = "var(--text-secondary)";

  const card = createCard({ content: placeholder });

  return createSection({
    title: "Home",
    description: "Your training overview at a glance.",
    content: createStack({
      direction: "column",
      gap: 16,
      children: [card],
    }),
  });
}
