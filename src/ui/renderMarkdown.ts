/**
 * renderMarkdown — Thin wrapper around `marked` for rendering
 * Markdown-formatted question text to HTML.
 *
 * Lives in the UI layer: this is presentation-only logic.
 * Data is trusted (local JSON from user import pipeline).
 */

import { marked } from "marked";

// Force synchronous mode so marked.parse() always returns string.
marked.use({ async: false });

/**
 * Render a raw Markdown string to an HTML string (synchronous).
 * Wraps `<table>` elements in a scrollable container so wide tables
 * scroll independently without affecting the rest of the question text.
 */
export function renderMarkdown(raw: string): string {
  const html = marked.parse(raw) as string;
  return html.replace(
    /<table>/g,
    '<div class="md-table-scroll"><table>',
  ).replace(
    /<\/table>/g,
    '</table></div>',
  );
}
