/**
 * View Mount Utility
 *
 * Simple helper to mount a view into the application root container.
 * No routing logic — just clears and appends.
 */

/**
 * Mounts a view element into the application root.
 *
 * Clears any existing content in the root container
 * and appends the provided view.
 *
 * @param view - The view HTMLElement to mount
 * @param rootId - The id of the root container element (defaults to "app")
 */
export function mountView(view: HTMLElement, rootId: string = "app"): void {
  const root = document.getElementById(rootId);
  if (!root) {
    throw new Error(`Mount target #${rootId} not found in DOM`);
  }
  root.innerHTML = "";
  root.appendChild(view);
}
