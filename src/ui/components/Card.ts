/**
 * Card Component — Reusable container panel
 *
 * Used for dashboard panels, analytics blocks, question panels.
 * Purely visual — no domain imports.
 */

export interface CardOptions {
  /** Optional card title displayed in the header */
  readonly title?: string;
  /** Main content element */
  readonly content: HTMLElement;
  /** Optional footer element */
  readonly footer?: HTMLElement;
  /** Optional extra CSS class */
  readonly className?: string;
}

/**
 * Creates a card container element.
 *
 * @param options - Card configuration
 * @returns A styled card HTMLElement
 */
export function createCard(options: CardOptions): HTMLElement {
  const card = document.createElement("div");
  card.className = "gx-card";
  if (options.className) {
    card.classList.add(options.className);
  }

  if (options.title) {
    const header = document.createElement("div");
    header.className = "gx-card__header";
    const titleEl = document.createElement("h3");
    titleEl.className = "gx-card__title";
    titleEl.textContent = options.title;
    header.appendChild(titleEl);
    card.appendChild(header);
  }

  const body = document.createElement("div");
  body.className = "gx-card__body";
  body.appendChild(options.content);
  card.appendChild(body);

  if (options.footer) {
    const footerEl = document.createElement("div");
    footerEl.className = "gx-card__footer";
    footerEl.appendChild(options.footer);
    card.appendChild(footerEl);
  }

  return card;
}
