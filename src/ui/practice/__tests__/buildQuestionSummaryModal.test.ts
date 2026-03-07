/**
 * Tests for buildQuestionSummaryModal — pure helper functions
 */

import { describe, it, expect } from "vitest";
import {
  computeSummaryData,
  findFirstUnanswered,
  findFirstFlagged,
} from "../buildQuestionSummaryModal.js";
import type { NavigatorItem } from "../buildQuestionNavigator.js";

function makeItem(
  index: number,
  state: "current" | "answered" | "unanswered",
  isFlagged = false,
): NavigatorItem {
  return {
    index,
    label: String(index + 1),
    state,
    isFlagged,
    isCurrent: state === "current",
  };
}

describe("computeSummaryData", () => {
  it("computes correct counts", () => {
    const data = computeSummaryData(60, 45, 3);
    expect(data.answered).toBe(45);
    expect(data.unanswered).toBe(15);
    expect(data.flagged).toBe(3);
    expect(data.total).toBe(60);
  });

  it("handles all answered", () => {
    const data = computeSummaryData(10, 10, 0);
    expect(data.unanswered).toBe(0);
  });

  it("handles none answered", () => {
    const data = computeSummaryData(10, 0, 2);
    expect(data.answered).toBe(0);
    expect(data.unanswered).toBe(10);
    expect(data.flagged).toBe(2);
  });

  it("handles zero questions", () => {
    const data = computeSummaryData(0, 0, 0);
    expect(data.total).toBe(0);
    expect(data.unanswered).toBe(0);
  });
});

describe("findFirstUnanswered", () => {
  it("returns first unanswered index", () => {
    const items = [
      makeItem(0, "answered"),
      makeItem(1, "answered"),
      makeItem(2, "unanswered"),
      makeItem(3, "unanswered"),
    ];
    expect(findFirstUnanswered(items)).toBe(2);
  });

  it("returns -1 when all answered", () => {
    const items = [
      makeItem(0, "answered"),
      makeItem(1, "answered"),
      makeItem(2, "answered"),
    ];
    expect(findFirstUnanswered(items)).toBe(-1);
  });

  it("finds current item if it is the only unanswered", () => {
    const items = [
      makeItem(0, "answered"),
      makeItem(1, "current"), // current but not answered
      makeItem(2, "answered"),
    ];
    expect(findFirstUnanswered(items)).toBe(1);
  });

  it("returns -1 for empty items", () => {
    expect(findFirstUnanswered([])).toBe(-1);
  });
});

describe("findFirstFlagged", () => {
  it("returns first flagged index", () => {
    const items = [
      makeItem(0, "answered", false),
      makeItem(1, "answered", false),
      makeItem(2, "unanswered", true),
      makeItem(3, "unanswered", true),
    ];
    expect(findFirstFlagged(items)).toBe(2);
  });

  it("returns -1 when none flagged", () => {
    const items = [
      makeItem(0, "answered", false),
      makeItem(1, "unanswered", false),
    ];
    expect(findFirstFlagged(items)).toBe(-1);
  });

  it("returns -1 for empty items", () => {
    expect(findFirstFlagged([])).toBe(-1);
  });
});
