/**
 * Phase 17 — Translation Key Coverage Tests
 *
 * Verifies:
 *  - Phase 17 specific keys exist in both en.ts and es.ts
 *  - All values are non-empty strings
 *  - en/es parity (already tested in phase16, but re-verified)
 */

import { describe, it, expect } from "vitest";
import { LANG_EN } from "../en.js";
import { LANG_ES } from "../es.js";

const PHASE_17_KEYS = [
  "loadingInsights",
  "loadingTelemetry",
  "errorGenericTitle",
  "errorReload",
  "appVersionLabel",
] as const;

describe("Phase 17 — Translation Keys", () => {
  it("all Phase 17 keys exist in en.ts", () => {
    for (const key of PHASE_17_KEYS) {
      expect(key in LANG_EN, `Missing from en.ts: ${key}`).toBe(true);
    }
  });

  it("all Phase 17 keys exist in es.ts", () => {
    for (const key of PHASE_17_KEYS) {
      expect(key in LANG_ES, `Missing from es.ts: ${key}`).toBe(true);
    }
  });

  it("all Phase 17 keys have non-empty values", () => {
    for (const key of PHASE_17_KEYS) {
      expect(
        (LANG_EN as Record<string, string>)[key]?.length,
        `en.${key} is empty`,
      ).toBeGreaterThan(0);
      expect(
        (LANG_ES as Record<string, string>)[key]?.length,
        `es.${key} is empty`,
      ).toBeGreaterThan(0);
    }
  });

  it("appVersionLabel contains {version} placeholder", () => {
    expect(LANG_EN.appVersionLabel).toContain("{version}");
    expect(LANG_ES.appVersionLabel).toContain("{version}");
  });
});
