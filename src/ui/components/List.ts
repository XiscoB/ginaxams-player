/**
 * List Component — Generic list renderer
 *
 * Maps an array of items to DOM elements inside a list container.
 * Purely visual — no domain imports.
 */

export interface ListOptions<T> {
  /** Array of data items to render */
  readonly items: ReadonlyArray<T>;
  /** Render function that maps each item to a DOM element */
  readonly renderItem: (item: T, index: number) => HTMLElement;
  /** Optional CSS class for the list container */
  readonly className?: string;
  /** Optional message displayed when items array is empty */
  readonly emptyMessage?: string;
}

/**
 * Creates a list element by mapping items through a render function.
 *
 * @param items - Array of data items
 * @param renderItem - Function that creates a DOM element for each item
 * @returns A list container HTMLElement
 */
export function createList<T>(
  items: ReadonlyArray<T>,
  renderItem: (item: T, index: number) => HTMLElement,
): HTMLElement;
/**
 * Creates a list element with full options.
 *
 * @param options - List configuration
 * @returns A list container HTMLElement
 */
export function createList<T>(options: ListOptions<T>): HTMLElement;
export function createList<T>(
  itemsOrOptions: ReadonlyArray<T> | ListOptions<T>,
  renderItem?: (item: T, index: number) => HTMLElement,
): HTMLElement {
  const opts: ListOptions<T> = Array.isArray(itemsOrOptions)
    ? { items: itemsOrOptions, renderItem: renderItem! }
    : (itemsOrOptions as ListOptions<T>);

  const container = document.createElement("div");
  container.className = "gx-list";
  if (opts.className) {
    container.classList.add(opts.className);
  }

  if (opts.items.length === 0) {
    if (opts.emptyMessage) {
      const empty = document.createElement("div");
      empty.className = "gx-list__empty";
      empty.textContent = opts.emptyMessage;
      container.appendChild(empty);
    }
    return container;
  }

  for (let i = 0; i < opts.items.length; i++) {
    const itemEl = opts.renderItem(opts.items[i], i);
    itemEl.classList.add("gx-list__item");
    container.appendChild(itemEl);
  }

  return container;
}
