/**
 * Defaults Module Unit Tests (M4 Specification)
 */

import { describe, it, expect } from "vitest";
import {
  DEFAULTS,
  getDefault,
  withDefaults,
  type Defaults,
  type DefaultKey,
} from "../defaults.js";

// ============================================================================
// DEFAULTS Constants Tests
// ============================================================================

describe("DEFAULTS", () => {
  it("has correct reviewQuestionCount default", () => {
    expect(DEFAULTS.reviewQuestionCount).toBe(60);
  });

  it("has correct wrongWeight default", () => {
    expect(DEFAULTS.wrongWeight).toBe(2);
  });

  it("has correct blankWeight default", () => {
    expect(DEFAULTS.blankWeight).toBe(1.2);
  });

  it("has correct recoveryWeight default", () => {
    expect(DEFAULTS.recoveryWeight).toBe(1);
  });

  it("has correct weakTimeThresholdMs default", () => {
    expect(DEFAULTS.weakTimeThresholdMs).toBe(15000);
  });

  it("is frozen (as const) and cannot be modified at compile time", () => {
    // Type-level check: DEFAULTS should be readonly
    type TestReadonly = typeof DEFAULTS extends {
      readonly [K in keyof Defaults]: Defaults[K];
    }
      ? true
      : false;
    const _typeCheck: TestReadonly = true;
    expect(_typeCheck).toBe(true);
  });

  it("contains all expected keys", () => {
    const keys = Object.keys(DEFAULTS) as DefaultKey[];
    expect(keys).toContain("reviewQuestionCount");
    expect(keys).toContain("wrongWeight");
    expect(keys).toContain("blankWeight");
    expect(keys).toContain("recoveryWeight");
    expect(keys).toContain("weakTimeThresholdMs");
    expect(keys).toContain("reviewWeakRatio");
    expect(keys).toContain("reviewMediumRatio");
    expect(keys).toContain("reviewRandomRatio");
    expect(keys).toHaveLength(8);
  });

  it("values are of correct types", () => {
    expect(typeof DEFAULTS.reviewQuestionCount).toBe("number");
    expect(typeof DEFAULTS.wrongWeight).toBe("number");
    expect(typeof DEFAULTS.blankWeight).toBe("number");
    expect(typeof DEFAULTS.recoveryWeight).toBe("number");
    expect(typeof DEFAULTS.weakTimeThresholdMs).toBe("number");
  });

  it("numeric values are positive", () => {
    expect(DEFAULTS.reviewQuestionCount).toBeGreaterThan(0);
    expect(DEFAULTS.wrongWeight).toBeGreaterThan(0);
    expect(DEFAULTS.blankWeight).toBeGreaterThan(0);
    expect(DEFAULTS.recoveryWeight).toBeGreaterThan(0);
    expect(DEFAULTS.weakTimeThresholdMs).toBeGreaterThan(0);
    expect(DEFAULTS.reviewWeakRatio).toBeGreaterThan(0);
    expect(DEFAULTS.reviewMediumRatio).toBeGreaterThan(0);
    expect(DEFAULTS.reviewRandomRatio).toBeGreaterThan(0);
  });

  it("review mix ratios have correct default values", () => {
    expect(DEFAULTS.reviewWeakRatio).toBe(0.6);
    expect(DEFAULTS.reviewMediumRatio).toBe(0.3);
    expect(DEFAULTS.reviewRandomRatio).toBe(0.1);
  });

  it("review mix ratios sum to 1.0", () => {
    const sum =
      DEFAULTS.reviewWeakRatio +
      DEFAULTS.reviewMediumRatio +
      DEFAULTS.reviewRandomRatio;
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it("reviewQuestionCount is an integer", () => {
    expect(Number.isInteger(DEFAULTS.reviewQuestionCount)).toBe(true);
  });

  it("weights have reasonable values", () => {
    // wrongWeight should be highest (wrong answers are worst)
    expect(DEFAULTS.wrongWeight).toBeGreaterThan(DEFAULTS.blankWeight);
    // blankWeight should be higher than recovery
    expect(DEFAULTS.blankWeight).toBeGreaterThan(DEFAULTS.recoveryWeight);
  });
});

// ============================================================================
// getDefault Function Tests
// ============================================================================

describe("getDefault", () => {
  it("returns correct value for reviewQuestionCount", () => {
    expect(getDefault("reviewQuestionCount")).toBe(60);
  });

  it("returns correct value for wrongWeight", () => {
    expect(getDefault("wrongWeight")).toBe(2);
  });

  it("returns correct value for blankWeight", () => {
    expect(getDefault("blankWeight")).toBe(1.2);
  });

  it("returns correct value for recoveryWeight", () => {
    expect(getDefault("recoveryWeight")).toBe(1);
  });

  it("returns correct value for weakTimeThresholdMs", () => {
    expect(getDefault("weakTimeThresholdMs")).toBe(15000);
  });

  it("returns correct value for reviewWeakRatio", () => {
    expect(getDefault("reviewWeakRatio")).toBe(0.6);
  });

  it("returns correct value for reviewMediumRatio", () => {
    expect(getDefault("reviewMediumRatio")).toBe(0.3);
  });

  it("returns correct value for reviewRandomRatio", () => {
    expect(getDefault("reviewRandomRatio")).toBe(0.1);
  });

  it("returns same values as direct DEFAULTS access", () => {
    (Object.keys(DEFAULTS) as DefaultKey[]).forEach((key) => {
      expect(getDefault(key)).toBe(DEFAULTS[key]);
    });
  });

  it("is a pure function (same input always produces same output)", () => {
    const result1 = getDefault("wrongWeight");
    const result2 = getDefault("wrongWeight");
    const result3 = getDefault("wrongWeight");
    expect(result1).toBe(result2);
    expect(result2).toBe(result3);
  });
});

// ============================================================================
// withDefaults Function Tests
// ============================================================================

describe("withDefaults", () => {
  it("returns all defaults when no overrides provided", () => {
    const result = withDefaults({});
    expect(result.reviewQuestionCount).toBe(60);
    expect(result.wrongWeight).toBe(2);
    expect(result.blankWeight).toBe(1.2);
    expect(result.recoveryWeight).toBe(1);
    expect(result.weakTimeThresholdMs).toBe(15000);
    expect(result.reviewWeakRatio).toBe(0.6);
    expect(result.reviewMediumRatio).toBe(0.3);
    expect(result.reviewRandomRatio).toBe(0.1);
  });

  it("applies single override correctly", () => {
    const result = withDefaults({ wrongWeight: 5 });
    expect(result.wrongWeight).toBe(5);
    expect(result.blankWeight).toBe(1.2); // default
    expect(result.recoveryWeight).toBe(1); // default
    expect(result.weakTimeThresholdMs).toBe(15000); // default
    expect(result.reviewQuestionCount).toBe(60); // default
  });

  it("applies multiple overrides correctly", () => {
    const result = withDefaults({
      wrongWeight: 5,
      blankWeight: 3,
      reviewQuestionCount: 30,
    });
    expect(result.wrongWeight).toBe(5);
    expect(result.blankWeight).toBe(3);
    expect(result.reviewQuestionCount).toBe(30);
    expect(result.recoveryWeight).toBe(1); // default
    expect(result.weakTimeThresholdMs).toBe(15000); // default
  });

  it("applies all overrides correctly", () => {
    const result = withDefaults({
      reviewQuestionCount: 100,
      wrongWeight: 3,
      blankWeight: 2,
      recoveryWeight: 1.5,
      weakTimeThresholdMs: 20000,
    });
    expect(result.reviewQuestionCount).toBe(100);
    expect(result.wrongWeight).toBe(3);
    expect(result.blankWeight).toBe(2);
    expect(result.recoveryWeight).toBe(1.5);
    expect(result.weakTimeThresholdMs).toBe(20000);
  });

  it("handles zero values as valid overrides", () => {
    const result = withDefaults({
      wrongWeight: 0,
      recoveryWeight: 0,
    });
    expect(result.wrongWeight).toBe(0);
    expect(result.recoveryWeight).toBe(0);
    expect(result.blankWeight).toBe(1.2); // default
  });

  it("does not mutate the input overrides object", () => {
    const overrides = { wrongWeight: 5 };
    const original = { ...overrides };
    withDefaults(overrides);
    expect(overrides).toEqual(original);
  });

  it("returns a new object (does not return defaults reference)", () => {
    const result = withDefaults({});
    expect(result).not.toBe(DEFAULTS);
  });

  it("returns independent copy (modifying result doesn't affect defaults)", () => {
    const result = withDefaults({});
    // This should not affect DEFAULTS since result is a new object
    // (though in practice we wouldn't modify the result)
    const originalWrongWeight = DEFAULTS.wrongWeight;
    // Modify the result - this is allowed since withDefaults returns mutable object
    result.wrongWeight = 999;
    expect(DEFAULTS.wrongWeight).toBe(originalWrongWeight);
  });

  it("is deterministic (same overrides always produce same result)", () => {
    const overrides = { wrongWeight: 5, blankWeight: 3 };
    const result1 = withDefaults(overrides);
    const result2 = withDefaults(overrides);
    const result3 = withDefaults(overrides);
    expect(result1).toEqual(result2);
    expect(result2).toEqual(result3);
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe("Defaults Integration", () => {
  it("defaults match the M4 specification requirements", () => {
    // Verify the defaults match exactly what was specified in M4
    expect(DEFAULTS.reviewQuestionCount).toBe(60);
    expect(DEFAULTS.wrongWeight).toBe(2);
    expect(DEFAULTS.blankWeight).toBe(1.2);
    expect(DEFAULTS.recoveryWeight).toBe(1);
    expect(DEFAULTS.weakTimeThresholdMs).toBe(15000);
    // Phase 5 adaptive review mix ratios
    expect(DEFAULTS.reviewWeakRatio).toBe(0.6);
    expect(DEFAULTS.reviewMediumRatio).toBe(0.3);
    expect(DEFAULTS.reviewRandomRatio).toBe(0.1);
  });

  it("can be used with weakness calculation", () => {
    // Simulate using defaults for weakness calculation
    const weights = {
      wrongWeight: DEFAULTS.wrongWeight,
      blankWeight: DEFAULTS.blankWeight,
      recoveryWeight: DEFAULTS.recoveryWeight,
      weakTimeThresholdMs: DEFAULTS.weakTimeThresholdMs,
    };

    // Verify structure is valid for WeaknessWeights interface
    expect(typeof weights.wrongWeight).toBe("number");
    expect(typeof weights.blankWeight).toBe("number");
    expect(typeof weights.recoveryWeight).toBe("number");
    expect(typeof weights.weakTimeThresholdMs).toBe("number");
  });

  it("can be partially overridden while keeping other defaults", () => {
    // Common use case: user wants to change only review count
    const userConfig = withDefaults({
      reviewQuestionCount: 30,
    });

    // Should keep all other defaults
    expect(userConfig.wrongWeight).toBe(DEFAULTS.wrongWeight);
    expect(userConfig.blankWeight).toBe(DEFAULTS.blankWeight);
    expect(userConfig.recoveryWeight).toBe(DEFAULTS.recoveryWeight);
    expect(userConfig.weakTimeThresholdMs).toBe(DEFAULTS.weakTimeThresholdMs);
    // But use the override
    expect(userConfig.reviewQuestionCount).toBe(30);
  });
});

// ============================================================================
// Type Safety Tests (compile-time, verified by TypeScript)
// ============================================================================

describe("Defaults Type Safety", () => {
  it("DefaultKey type includes all keys", () => {
    // This is a compile-time check, but we can verify at runtime
    const validKeys: DefaultKey[] = [
      "reviewQuestionCount",
      "wrongWeight",
      "blankWeight",
      "recoveryWeight",
      "weakTimeThresholdMs",
      "reviewWeakRatio",
      "reviewMediumRatio",
      "reviewRandomRatio",
    ];
    expect(validKeys).toHaveLength(8);
  });

  it("Defaults type has correct structure", () => {
    const defaults: Defaults = DEFAULTS;
    expect(defaults).toBeDefined();
    expect(typeof defaults.reviewQuestionCount).toBe("number");
  });

  it("getDefault is type-safe (returns correct type for each key)", () => {
    // These would fail TypeScript compilation if types were wrong
    const reviewCount: number = getDefault("reviewQuestionCount");
    const wrongWeight: number = getDefault("wrongWeight");
    const blankWeight: number = getDefault("blankWeight");
    const recoveryWeight: number = getDefault("recoveryWeight");
    const timeThreshold: number = getDefault("weakTimeThresholdMs");

    expect(typeof reviewCount).toBe("number");
    expect(typeof wrongWeight).toBe("number");
    expect(typeof blankWeight).toBe("number");
    expect(typeof recoveryWeight).toBe("number");
    expect(typeof timeThreshold).toBe("number");
  });
});
