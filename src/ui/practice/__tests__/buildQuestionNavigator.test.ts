/**
 * Tests for buildQuestionNavigator — pure helper functions
 */

import { describe, it, expect } from "vitest";
import {
  computeNavigatorItems,
  computeSummaryFromCounts,
} from "../buildQuestionNavigator.js";

describe("computeNavigatorItems", () => {
  it("creates correct number of items", () => {
    const items = computeNavigatorItems(5, 0, new Set(), new Set());
    expect(items).toHaveLength(5);
  });

  it("labels are 1-based", () => {
    const items = computeNavigatorItems(3, 0, new Set(), new Set());
    expect(items.map((i) => i.label)).toEqual(["1", "2", "3"]);
  });

  it("indices are 0-based", () => {
    const items = computeNavigatorItems(3, 0, new Set(), new Set());
    expect(items.map((i) => i.index)).toEqual([0, 1, 2]);
  });

  it("marks current question with state 'current'", () => {
    const items = computeNavigatorItems(5, 2, new Set(), new Set());
    expect(items[2].state).toBe("current");
    expect(items[2].isCurrent).toBe(true);
    expect(items[0].isCurrent).toBe(false);
  });

  it("marks answered questions with state 'answered'", () => {
    const answered = new Set([0, 1, 3]);
    const items = computeNavigatorItems(5, 2, answered, new Set());
    expect(items[0].state).toBe("answered");
    expect(items[1].state).toBe("answered");
    expect(items[3].state).toBe("answered");
  });

  it("marks unanswered questions with state 'unanswered'", () => {
    const answered = new Set([0]);
    const items = computeNavigatorItems(5, 0, answered, new Set());
    expect(items[1].state).toBe("unanswered");
    expect(items[4].state).toBe("unanswered");
  });

  it("current question gets 'current' state even if answered", () => {
    const answered = new Set([2]);
    const items = computeNavigatorItems(5, 2, answered, new Set());
    // Current always takes priority visually
    expect(items[2].state).toBe("current");
  });

  it("marks flagged questions", () => {
    const flagged = new Set([1, 3]);
    const items = computeNavigatorItems(5, 0, new Set(), flagged);
    expect(items[0].isFlagged).toBe(false);
    expect(items[1].isFlagged).toBe(true);
    expect(items[2].isFlagged).toBe(false);
    expect(items[3].isFlagged).toBe(true);
  });

  it("handles empty exam (0 questions)", () => {
    const items = computeNavigatorItems(0, 0, new Set(), new Set());
    expect(items).toHaveLength(0);
  });

  it("handles all answered and flagged", () => {
    const answered = new Set([0, 1, 2]);
    const flagged = new Set([0, 1, 2]);
    const items = computeNavigatorItems(3, 1, answered, flagged);
    expect(items[0].state).toBe("answered");
    expect(items[0].isFlagged).toBe(true);
    expect(items[1].state).toBe("current");
    expect(items[1].isFlagged).toBe(true);
    expect(items[2].state).toBe("answered");
    expect(items[2].isFlagged).toBe(true);
  });
});

describe("computeSummaryFromCounts", () => {
  it("computes basic counts", () => {
    const summary = computeSummaryFromCounts(60, 45, 3);
    expect(summary.total).toBe(60);
    expect(summary.answered).toBe(45);
    expect(summary.unanswered).toBe(15);
    expect(summary.flagged).toBe(3);
  });

  it("handles all answered", () => {
    const summary = computeSummaryFromCounts(10, 10, 0);
    expect(summary.unanswered).toBe(0);
    expect(summary.flagged).toBe(0);
  });

  it("handles none answered", () => {
    const summary = computeSummaryFromCounts(10, 0, 5);
    expect(summary.answered).toBe(0);
    expect(summary.unanswered).toBe(10);
    expect(summary.flagged).toBe(5);
  });

  it("handles zero total questions", () => {
    const summary = computeSummaryFromCounts(0, 0, 0);
    expect(summary.total).toBe(0);
    expect(summary.unanswered).toBe(0);
  });
});
