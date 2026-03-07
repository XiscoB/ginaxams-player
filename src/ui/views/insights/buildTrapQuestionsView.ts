/**
 * Trap Questions View Builder — Insights Phase 12
 *
 * Renders the Trap Questions card with:
 * - Only questions with trap level "possible" or "confirmed"
 * - Trap level badge
 * - Category context
 * - Accessible feedback
 *
 * No domain imports — uses enriched InsightsViewData only.
 */

import type {
  InsightsViewData,
  InsightsQuestionData,
} from "../../../application/viewState.js";
import type { Translations } from "../../../i18n/index.js";
import { createCard } from "../../components/Card.js";
import { createList } from "../../components/List.js";
import { createBadge } from "../../components/Badge.js";

import { getTrapQuestions, truncateText } from "./insightsHelpers.js";

// ============================================================================
// Main Builder
// ============================================================================

/**
 * Build the Trap Questions card.
 *
 * @param data - Full insights data
 * @returns Card HTMLElement
 */
export function buildTrapQuestionsView(
  data: InsightsViewData,
  T?: Translations,
): HTMLElement {
  const traps = getTrapQuestions(data.questions);
  const title = T?.insightsTrapQuestions ?? "Trap Questions";

  if (traps.length === 0) {
    const empty = document.createElement("p");
    empty.textContent =
      T?.insightsTrapQuestionsEmpty ??
      "No trap questions detected yet. Keep practicing!";
    empty.style.color = "var(--text-secondary)";
    empty.style.fontSize = "0.875rem";
    return createCard({ title, content: empty });
  }

  const list = createList(traps, (q) => buildTrapRow(q, T));

  return createCard({ title, content: list });
}

// ============================================================================
// Row Builder
// ============================================================================

function buildTrapRow(q: InsightsQuestionData, T?: Translations): HTMLElement {
  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.flexDirection = "column";
  row.style.gap = "4px";
  row.style.padding = "8px 0";

  // Header: question text + trap badge
  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.alignItems = "center";
  header.style.gap = "8px";
  header.style.cursor = "pointer";

  const preview = document.createElement("span");
  preview.textContent = truncateText(q.questionText);
  preview.style.flex = "1";
  preview.style.fontSize = "0.875rem";
  preview.style.color = "var(--text-primary)";
  preview.style.overflow = "hidden";
  preview.style.textOverflow = "ellipsis";
  preview.style.whiteSpace = "nowrap";

  const trapBadge = createBadge(
    `${T?.trapPrefix ?? "trap"}: ${q.trapLevel}`,
    q.trapLevel === "confirmed" ? "danger" : "warning",
  );

  // Toggle arrow
  const arrow = document.createElement("span");
  arrow.textContent = "▶";
  arrow.style.fontSize = "0.75rem";
  arrow.style.color = "var(--text-secondary)";
  arrow.style.transition = "transform 0.2s";

  header.appendChild(preview);
  header.appendChild(trapBadge);
  header.appendChild(arrow);

  // Category context
  const categoryLine = document.createElement("div");
  categoryLine.textContent = `${T?.insightsCategory ?? "Category"}: ${q.categories.join(", ")}`;
  categoryLine.style.fontSize = "0.8rem";
  categoryLine.style.color = "var(--text-secondary)";

  // Expandable feedback
  const feedbackPanel = document.createElement("div");
  feedbackPanel.style.display = "none";
  feedbackPanel.style.paddingLeft = "16px";
  feedbackPanel.style.borderLeft =
    "2px solid var(--border-color, rgba(255,255,255,0.1))";
  feedbackPanel.style.marginTop = "4px";
  feedbackPanel.style.fontSize = "0.8rem";

  if (q.feedback.explanation) {
    const explTitle = document.createElement("div");
    explTitle.textContent = T?.insightsFeedback ?? "Feedback:";
    explTitle.style.fontWeight = "600";
    explTitle.style.color = "var(--text-primary)";
    feedbackPanel.appendChild(explTitle);

    const expl = document.createElement("p");
    expl.textContent = q.feedback.explanation;
    expl.style.color = "var(--text-secondary)";
    expl.style.margin = "4px 0";
    expl.style.lineHeight = "1.4";
    feedbackPanel.appendChild(expl);
  }

  if (q.feedback.literalCitation) {
    const citeTitle = document.createElement("div");
    citeTitle.textContent = T?.insightsCitation ?? "Citation:";
    citeTitle.style.fontWeight = "600";
    citeTitle.style.color = "var(--text-primary)";
    citeTitle.style.marginTop = "4px";
    feedbackPanel.appendChild(citeTitle);

    const cite = document.createElement("p");
    cite.textContent = q.feedback.literalCitation;
    cite.style.color = "var(--text-secondary)";
    cite.style.margin = "4px 0";
    cite.style.fontStyle = "italic";
    cite.style.lineHeight = "1.4";
    feedbackPanel.appendChild(cite);
  }

  const ref = document.createElement("div");
  ref.textContent = `${T?.insightsReference ?? "Reference"}: ${q.referenceArticle}`;
  ref.style.color = "var(--text-secondary)";
  ref.style.marginTop = "4px";
  ref.style.fontStyle = "italic";
  feedbackPanel.appendChild(ref);

  header.addEventListener("click", () => {
    const isOpen = feedbackPanel.style.display !== "none";
    feedbackPanel.style.display = isOpen ? "none" : "block";
    arrow.textContent = isOpen ? "▶" : "▼";
  });

  row.appendChild(header);
  row.appendChild(categoryLine);
  row.appendChild(feedbackPanel);

  return row;
}
