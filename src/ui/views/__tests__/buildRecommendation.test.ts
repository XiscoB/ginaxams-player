/**
 * buildRecommendation — Unit Tests
 *
 * Verifies the recommendation decision table:
 *   score < 40  → "not_ready" / "Start Review"
 *   40–69       → "almost_ready" / "Start Review"
 *   70–85       → "ready" / "Start Simulacro"
 *   > 85        → "exam_ready" / "Start Simulacro"
 *
 * Tests are DOM-free — only verifies message, actionLabel, level, and action.
 */

import { describe, it, expect, vi } from "vitest";
import {
  buildRecommendation,
  type Recommendation,
} from "../home/buildRecommendation.js";
import type { HomeViewData } from "../../../application/viewState.js";

// ============================================================================
// Helpers
// ============================================================================

function makeHomeViewData(
  score: number,
  level: string = "not_ready",
  weakCount: number = 0,
): HomeViewData {
  const weakCategories = Array.from({ length: weakCount }, (_, i) => ({
    category: `cat-${i}`,
    weaknessScore: 3,
    accuracy: 0.2,
    level: "weak" as const,
  }));

  const strongCategories = [
    {
      category: "strong-cat",
      weaknessScore: 0,
      accuracy: 0.9,
      level: "mastered" as const,
    },
  ];

  return {
    readiness: {
      score,
      level,
      breakdown: {
        categoryMastery: 0.5,
        simulacroAccuracy: 0.5,
        recoveryRate: 0.5,
      },
    },
    categoryMastery: [...weakCategories, ...strongCategories],
    attempts: [],
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("buildRecommendation", () => {
  describe("decision table", () => {
    it("returns not_ready for score < 40", () => {
      const data = makeHomeViewData(30, "not_ready", 2);
      const rec = buildRecommendation(data);

      expect(rec.level).toBe("not_ready");
      expect(rec.actionLabel).toBe("Start Review");
      expect(rec.message).toContain("2 weak categories");
    });

    it("returns not_ready with generic message when no weak categories", () => {
      const data = makeHomeViewData(20, "not_ready", 0);
      const rec = buildRecommendation(data);

      expect(rec.level).toBe("not_ready");
      expect(rec.actionLabel).toBe("Start Review");
      expect(rec.message).toContain("readiness score is low");
    });

    it("uses singular 'category' for 1 weak category", () => {
      const data = makeHomeViewData(10, "not_ready", 1);
      const rec = buildRecommendation(data);

      expect(rec.message).toContain("1 weak category");
      expect(rec.message).not.toContain("categories");
    });

    it("returns almost_ready for score 40–69", () => {
      const data = makeHomeViewData(55, "almost_ready");
      const rec = buildRecommendation(data);

      expect(rec.level).toBe("almost_ready");
      expect(rec.actionLabel).toBe("Start Review");
      expect(rec.message).toContain("progress");
    });

    it("returns almost_ready at boundary score = 40", () => {
      const data = makeHomeViewData(40, "almost_ready");
      const rec = buildRecommendation(data);

      expect(rec.level).toBe("almost_ready");
    });

    it("returns ready for score 70–85", () => {
      const data = makeHomeViewData(75, "ready");
      const rec = buildRecommendation(data);

      expect(rec.level).toBe("ready");
      expect(rec.actionLabel).toBe("Start Simulacro");
      expect(rec.message).toContain("simulacro");
    });

    it("returns ready at boundary score = 70", () => {
      const data = makeHomeViewData(70, "ready");
      const rec = buildRecommendation(data);

      expect(rec.level).toBe("ready");
      expect(rec.actionLabel).toBe("Start Simulacro");
    });

    it("returns ready at boundary score = 85", () => {
      const data = makeHomeViewData(85, "ready");
      const rec = buildRecommendation(data);

      expect(rec.level).toBe("ready");
    });

    it("returns exam_ready for score > 85", () => {
      const data = makeHomeViewData(92, "exam_ready");
      const rec = buildRecommendation(data);

      expect(rec.level).toBe("exam_ready");
      expect(rec.actionLabel).toBe("Start Simulacro");
      expect(rec.message).toContain("ready for the exam");
    });

    it("returns exam_ready at score = 100", () => {
      const data = makeHomeViewData(100, "exam_ready");
      const rec = buildRecommendation(data);

      expect(rec.level).toBe("exam_ready");
    });
  });

  describe("action callbacks", () => {
    it("uses startReview callback for not_ready", () => {
      const startReview = vi.fn();
      const data = makeHomeViewData(30, "not_ready");
      const rec = buildRecommendation(data, { startReview });

      rec.action();
      expect(startReview).toHaveBeenCalledOnce();
    });

    it("uses startReview callback for almost_ready", () => {
      const startReview = vi.fn();
      const data = makeHomeViewData(55, "almost_ready");
      const rec = buildRecommendation(data, { startReview });

      rec.action();
      expect(startReview).toHaveBeenCalledOnce();
    });

    it("uses startSimulacro callback for ready", () => {
      const startSimulacro = vi.fn();
      const data = makeHomeViewData(75, "ready");
      const rec = buildRecommendation(data, { startSimulacro });

      rec.action();
      expect(startSimulacro).toHaveBeenCalledOnce();
    });

    it("uses startSimulacro callback for exam_ready", () => {
      const startSimulacro = vi.fn();
      const data = makeHomeViewData(92, "exam_ready");
      const rec = buildRecommendation(data, { startSimulacro });

      rec.action();
      expect(startSimulacro).toHaveBeenCalledOnce();
    });

    it("uses noop when no callbacks provided", () => {
      const data = makeHomeViewData(30, "not_ready");
      const rec = buildRecommendation(data);

      // Should not throw
      expect(() => rec.action()).not.toThrow();
    });

    it("uses noop for missing specific callback", () => {
      const startSimulacro = vi.fn();
      const data = makeHomeViewData(30, "not_ready");
      // Providing startSimulacro but not startReview
      const rec = buildRecommendation(data, { startSimulacro });

      expect(() => rec.action()).not.toThrow();
      expect(startSimulacro).not.toHaveBeenCalled();
    });
  });

  describe("return shape", () => {
    it("returns all required fields", () => {
      const data = makeHomeViewData(50, "almost_ready");
      const rec: Recommendation = buildRecommendation(data);

      expect(rec).toHaveProperty("message");
      expect(rec).toHaveProperty("actionLabel");
      expect(rec).toHaveProperty("level");
      expect(rec).toHaveProperty("action");
      expect(typeof rec.message).toBe("string");
      expect(typeof rec.actionLabel).toBe("string");
      expect(typeof rec.level).toBe("string");
      expect(typeof rec.action).toBe("function");
    });

    it("message is non-empty for all levels", () => {
      for (const [score, level] of [
        [10, "not_ready"],
        [50, "almost_ready"],
        [75, "ready"],
        [95, "exam_ready"],
      ] as const) {
        const data = makeHomeViewData(score, level);
        const rec = buildRecommendation(data);
        expect(rec.message.length).toBeGreaterThan(0);
      }
    });
  });
});
