/**
 * Phase 17 — ViewStatus & Version Tests (DOM-free)
 *
 * Tests APP_VERSION constant and validates ViewStatus module exports.
 * DOM-builder tests are skipped since the project uses node environment.
 */

import { describe, it, expect } from "vitest";
import { APP_VERSION } from "../../application/version.js";

// ============================================================================
// APP_VERSION
// ============================================================================

describe("APP_VERSION", () => {
  it("is a non-empty string", () => {
    expect(typeof APP_VERSION).toBe("string");
    expect(APP_VERSION.length).toBeGreaterThan(0);
  });

  it("matches expected format (semver-like)", () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+/);
  });

  it("equals 1.2 for this release", () => {
    expect(APP_VERSION).toBe("1.2");
  });
});

// ============================================================================
// ViewStatus module exports
// ============================================================================

describe("ViewStatus module", () => {
  it("exports all expected functions", async () => {
    const mod = await import("../components/ViewStatus.js");
    expect(typeof mod.createLoadingIndicator).toBe("function");
    expect(typeof mod.createErrorState).toBe("function");
    expect(typeof mod.createViewLoading).toBe("function");
    expect(typeof mod.createViewError).toBe("function");
  });
});
