/**
 * Phase 16 — Translation Coverage Tests
 *
 * Verifies:
 *  - en/es key parity (every key exists in both languages)
 *  - Phase 16 specific keys exist
 *  - All Phase 16 keys have non-empty values in both languages
 */

import { describe, it, expect } from "vitest";
import { LANG_EN } from "../en.js";
import { LANG_ES } from "../es.js";
import { getTranslations } from "../index.js";

// ============================================================================
// Phase 16 keys that must exist
// ============================================================================

const INSIGHTS_KEYS = [
  "insightsTitle",
  "insightsDescription",
  "insightsCategoryMastery",
  "insightsCategoryMasteryEmpty",
  "insightsAccuracy",
  "insightsQuestions",
  "insightsNoCategoryQuestions",
  "insightsWeakQuestions",
  "insightsWeakQuestionsEmpty",
  "insightsAnswers",
  "insightsExplanation",
  "insightsReference",
  "insightsAllCategories",
  "insightsTrapQuestions",
  "insightsTrapQuestionsEmpty",
  "insightsCategory",
  "insightsFeedback",
  "insightsCitation",
  "insightsProgressTimeline",
  "insightsProgressEmpty",
  "insightsDifficultyDistribution",
  "insightsDifficultyEasy",
  "insightsDifficultyMedium",
  "insightsDifficultyHard",
  "insightsTotalQuestions",
  "insightsNoDifficultyQuestions",
] as const;

const TELEMETRY_KEYS = [
  "telemetryTitle",
  "telemetryDescription",
  "telemetryQuestionPerformance",
  "telemetryMostFailed",
  "telemetrySlowest",
  "telemetryUnseen",
  "telemetryNoMatchingQuestions",
  "telemetryNoFailedQuestions",
  "telemetryNoAttemptedQuestions",
  "telemetryAllAttempted",
  "telemetryUnseenByCategory",
  "telemetryNeverPracticed",
  "telemetryNever",
  "telemetryEmptyTitle",
  "telemetryEmptyMessage",
] as const;

describe("Phase 16 — Translation Coverage", () => {
  describe("en/es key parity", () => {
    it("every key in LANG_EN exists in LANG_ES", () => {
      const enKeys = Object.keys(LANG_EN);
      const esKeys = new Set(Object.keys(LANG_ES));
      const missing = enKeys.filter((k) => !esKeys.has(k));
      expect(missing, `Keys missing from es.ts: ${missing.join(", ")}`).toEqual(
        [],
      );
    });

    it("every key in LANG_ES exists in LANG_EN", () => {
      const esKeys = Object.keys(LANG_ES);
      const enKeys = new Set(Object.keys(LANG_EN));
      const extra = esKeys.filter((k) => !enKeys.has(k));
      expect(
        extra,
        `Extra keys in es.ts not in en.ts: ${extra.join(", ")}`,
      ).toEqual([]);
    });
  });

  describe("Insights keys", () => {
    it("all insights keys exist in en.ts", () => {
      for (const key of INSIGHTS_KEYS) {
        expect(key in LANG_EN, `Missing from en.ts: ${key}`).toBe(true);
      }
    });

    it("all insights keys exist in es.ts", () => {
      for (const key of INSIGHTS_KEYS) {
        expect(key in LANG_ES, `Missing from es.ts: ${key}`).toBe(true);
      }
    });

    it("all insights keys have non-empty values in both languages", () => {
      const en = getTranslations("en");
      const es = getTranslations("es");
      for (const key of INSIGHTS_KEYS) {
        expect(en[key].length, `en ${key} empty`).toBeGreaterThan(0);
        expect(es[key].length, `es ${key} empty`).toBeGreaterThan(0);
      }
    });
  });

  describe("Telemetry keys", () => {
    it("all telemetry keys exist in en.ts", () => {
      for (const key of TELEMETRY_KEYS) {
        expect(key in LANG_EN, `Missing from en.ts: ${key}`).toBe(true);
      }
    });

    it("all telemetry keys exist in es.ts", () => {
      for (const key of TELEMETRY_KEYS) {
        expect(key in LANG_ES, `Missing from es.ts: ${key}`).toBe(true);
      }
    });

    it("all telemetry keys have non-empty values in both languages", () => {
      const en = getTranslations("en");
      const es = getTranslations("es");
      for (const key of TELEMETRY_KEYS) {
        expect(en[key].length, `en ${key} empty`).toBeGreaterThan(0);
        expect(es[key].length, `es ${key} empty`).toBeGreaterThan(0);
      }
    });
  });

  describe("all keys have non-empty string values", () => {
    it("English translations", () => {
      for (const [key, value] of Object.entries(LANG_EN)) {
        expect(typeof value, `en.${key} not a string`).toBe("string");
        expect(value.length, `en.${key} is empty`).toBeGreaterThan(0);
      }
    });

    it("Spanish translations", () => {
      for (const [key, value] of Object.entries(LANG_ES)) {
        expect(typeof value, `es.${key} not a string`).toBe("string");
        expect(value.length, `es.${key} is empty`).toBeGreaterThan(0);
      }
    });
  });
});
