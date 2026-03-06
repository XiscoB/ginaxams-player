/**
 * Centralized Default Configuration
 *
 * All default parameters for the exam system are defined here.
 * No other file may hardcode these values.
 *
 * Future UI settings will override them.
 * Domain layer receives them via config injection.
 */

/**
 * Default configuration values for the entire application.
 * Use `as const` to ensure type safety and prevent accidental mutation.
 */
export const DEFAULTS = {
  // Review mode settings
  reviewQuestionCount: 60,

  // Weakness calculation weights
  wrongWeight: 2,
  blankWeight: 1.2,
  recoveryWeight: 1,

  // Time threshold for weakness calculation (15 seconds)
  weakTimeThresholdMs: 15000,

  // Adaptive review mix ratios (must sum to 1.0)
  reviewWeakRatio: 0.6,
  reviewMediumRatio: 0.3,
  reviewRandomRatio: 0.1,

  // Category mastery boost/penalty multipliers (Phase 6)
  masteryWeakBoost: 1.2,
  masteryLearningBoost: 1.1,
  masteryMasteredPenalty: 0.85,

  // Spaced repetition cooldown (Phase 7)
  reviewCooldownWindowMs: 5 * 60 * 1000, // 5 minutes
  cooldownMinMultiplier: 0.2,
} as const;

/**
 * Type representing the structure of DEFAULTS.
 * Useful for type-safe configuration overrides.
 */
export type Defaults = typeof DEFAULTS;

/**
 * Type representing valid keys in DEFAULTS.
 */
export type DefaultKey = keyof typeof DEFAULTS;

/**
 * Get a default value by key.
 * Pure function for retrieving default configuration values.
 *
 * @param key - The configuration key to retrieve
 * @returns The default value for the given key
 */
export function getDefault<K extends DefaultKey>(key: K): Defaults[K] {
  return DEFAULTS[key];
}

/**
 * Create a complete configuration object by merging overrides with defaults.
 * Missing values are filled in from DEFAULTS.
 *
 * @param overrides - Partial configuration to override defaults
 * @returns Complete configuration with defaults applied
 */
export function withDefaults(
  overrides: Partial<{
    reviewQuestionCount: number;
    wrongWeight: number;
    blankWeight: number;
    recoveryWeight: number;
    weakTimeThresholdMs: number;
    reviewWeakRatio: number;
    reviewMediumRatio: number;
    reviewRandomRatio: number;
    masteryWeakBoost: number;
    masteryLearningBoost: number;
    masteryMasteredPenalty: number;
    reviewCooldownWindowMs: number;
    cooldownMinMultiplier: number;
  }>,
): {
  reviewQuestionCount: number;
  wrongWeight: number;
  blankWeight: number;
  recoveryWeight: number;
  weakTimeThresholdMs: number;
  reviewWeakRatio: number;
  reviewMediumRatio: number;
  reviewRandomRatio: number;
  masteryWeakBoost: number;
  masteryLearningBoost: number;
  masteryMasteredPenalty: number;
  reviewCooldownWindowMs: number;
  cooldownMinMultiplier: number;
} {
  return {
    reviewQuestionCount:
      overrides.reviewQuestionCount ?? DEFAULTS.reviewQuestionCount,
    wrongWeight: overrides.wrongWeight ?? DEFAULTS.wrongWeight,
    blankWeight: overrides.blankWeight ?? DEFAULTS.blankWeight,
    recoveryWeight: overrides.recoveryWeight ?? DEFAULTS.recoveryWeight,
    weakTimeThresholdMs:
      overrides.weakTimeThresholdMs ?? DEFAULTS.weakTimeThresholdMs,
    reviewWeakRatio: overrides.reviewWeakRatio ?? DEFAULTS.reviewWeakRatio,
    reviewMediumRatio:
      overrides.reviewMediumRatio ?? DEFAULTS.reviewMediumRatio,
    reviewRandomRatio:
      overrides.reviewRandomRatio ?? DEFAULTS.reviewRandomRatio,
    masteryWeakBoost: overrides.masteryWeakBoost ?? DEFAULTS.masteryWeakBoost,
    masteryLearningBoost:
      overrides.masteryLearningBoost ?? DEFAULTS.masteryLearningBoost,
    masteryMasteredPenalty:
      overrides.masteryMasteredPenalty ?? DEFAULTS.masteryMasteredPenalty,
    reviewCooldownWindowMs:
      overrides.reviewCooldownWindowMs ?? DEFAULTS.reviewCooldownWindowMs,
    cooldownMinMultiplier:
      overrides.cooldownMinMultiplier ?? DEFAULTS.cooldownMinMultiplier,
  };
}
