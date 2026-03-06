/**
 * Review Selection Module - Deterministic adaptive question selection (Phase 5)
 *
 * This module provides pure functions for selecting questions for review mode
 * based on weakness scores, telemetry data, and a configurable distribution.
 *
 * Phase 5 adaptive mix:
 *   60% weakest questions (highest weakness scores)
 *   30% medium weakness questions (next segment after weak)
 *   10% random unseen questions (totalSeen === 0), with fallback to least recently seen
 *
 * Rules:
 * - All functions are pure (no side effects, no mutation)
 * - Deterministic sorting with explicit tie-breaking
 * - Random selection uses injected seeded RNG (no Math.random)
 * - No telemetry mutation
 * - No UI dependencies
 * - No imports from defaults (config injected via arguments)
 */

import type {
  Question,
  QuestionTelemetry,
  MasteryBoostConfig,
} from "./types.js";
import { computeWeakScore, type WeaknessWeights } from "./weakness.js";
import { createInitialTelemetry } from "./telemetry.js";
import { randomSampleWithoutReplacement } from "./distribution.js";
import { createSeededRNG, hashStringToSeed } from "./seededRng.js";
import {
  computeCategoryMastery,
  DEFAULT_MASTERY_THRESHOLDS,
} from "./categoryMastery.js";
import {
  applyCooldownScheduling,
  type CooldownConfig,
} from "./spacedRepetition.js";

/**
 * Question with its computed weakness and selection metadata
 */
export interface ReviewQuestion {
  question: Question;
  telemetry: QuestionTelemetry;
  weakness: number;
  isWeaknessBased: boolean; // true if selected by weakness, false if fallback
}

/**
 * Ratios for the adaptive review mix.
 * Must sum to 1.0.
 */
export interface ReviewMixRatios {
  weakRatio: number;
  mediumRatio: number;
  randomRatio: number;
}

/**
 * Generate the review question set deterministically.
 *
 * Selection process:
 * 1. Compute weakness for all questions with telemetry
 * 2. Create empty telemetry for questions without data
 * 3. Sort by: weakness DESC → lastSeenAt ASC (older first) → question.number ASC
 * 4. Take top N by weakness
 * 5. If fewer than N, fill remainder with least recently seen questions
 * 6. Return deterministic ordered list
 *
 * @param questions - All questions from the exam(s)
 * @param telemetryList - Existing telemetry for some questions
 * @param count - Number of questions to select (default 60)
 * @param weights - Weakness calculation weights
 * @returns Deterministically sorted review questions
 */
export function generateReviewQuestions(
  questions: Question[],
  telemetryList: QuestionTelemetry[],
  count: number,
  weights: WeaknessWeights,
): ReviewQuestion[] {
  // Create lookup map for existing telemetry (keyed by questionNumber)
  const telemetryMap = new Map<number, QuestionTelemetry>();
  for (const t of telemetryList) {
    telemetryMap.set(t.questionNumber, t);
  }

  // Build review items for all questions
  const items: ReviewQuestion[] = questions.map((question) => {
    // Use existing telemetry or create empty
    const existing = telemetryMap.get(question.number);
    const telemetry =
      existing ?? createInitialTelemetry("exam", question.number);

    // Compute weakness (0 for empty telemetry)
    const weakness = computeWeakScore(telemetry, weights);

    return {
      question,
      telemetry,
      weakness,
      isWeaknessBased: false, // Will be set after sorting
    };
  });

  // Sort deterministically
  sortByWeaknessDescending(items);

  // Mark weakness-based selections
  for (let i = 0; i < items.length; i++) {
    items[i].isWeaknessBased = i < count;
  }

  // Take top N
  return items.slice(0, Math.max(0, count));
}

/**
 * Sort review questions by weakness DESC → lastSeenAt ASC → number ASC.
 * Mutates the array in place for efficiency. Used internally.
 */
function sortByWeaknessDescending(items: ReviewQuestion[]): void {
  items.sort((a, b) => {
    // Primary: weakness DESC
    if (b.weakness !== a.weakness) {
      return b.weakness - a.weakness;
    }

    // Secondary: lastSeenAt ASC (empty = never seen = comes first)
    const aSeen = a.telemetry.lastSeenAt;
    const bSeen = b.telemetry.lastSeenAt;
    if (aSeen !== bSeen) {
      if (aSeen === "") return -1;
      if (bSeen === "") return 1;
      return aSeen.localeCompare(bSeen);
    }

    // Tertiary: question.number ASC
    return a.question.number - b.question.number;
  });
}

/**
 * Sort questions by lastSeenAt (ascending) with deterministic tie-breaking.
 * Used for fallback selection when weakness-based selection doesn't fill quota.
 *
 * @param items - Review questions to sort
 * @returns Sorted array (least recently seen first)
 */
export function sortByLastSeen(items: ReviewQuestion[]): ReviewQuestion[] {
  return [...items].sort((a, b) => {
    // Primary: lastSeenAt ASC (empty = never seen = first)
    const aSeen = a.telemetry.lastSeenAt;
    const bSeen = b.telemetry.lastSeenAt;

    if (aSeen !== bSeen) {
      if (aSeen === "") return -1;
      if (bSeen === "") return 1;
      return aSeen.localeCompare(bSeen);
    }

    // Secondary: question.number ASC
    return a.question.number - b.question.number;
  });
}

/**
 * Select questions for adaptive review with a deterministic distribution.
 *
 * Phase 5 algorithm:
 * 1. Compute weakness for all questions and sort by weakness DESC.
 * 2. Compute target counts from ratios:
 *    - weakCount  = floor(count × weakRatio)
 *    - mediumCount = floor(count × mediumRatio)
 *    - randomCount = count - weakCount - mediumCount  (absorbs rounding remainder)
 * 3. Populate buckets in priority order:
 *    a) Weak bucket: sorted[0..weakCount) — the weakest items.
 *    b) Medium bucket: sorted[weakCount..weakCount+mediumCount) — next segment.
 *    c) Random/unseen bucket: randomly sample randomCount from items with
 *       totalSeen === 0 (excluding already-selected). If insufficient unseen,
 *       fill with least recently seen items (by lastSeenAt ASC).
 * 4. If any bucket has insufficient items, redistribute shortfall to subsequent
 *    buckets (weak overflow → medium → random/fallback).
 * 5. Deduplicate: a question appears in at most one bucket.
 *
 * @param questions - All available questions
 * @param telemetryList - Existing telemetry
 * @param count - Target number of questions
 * @param weights - Weakness calculation weights
 * @param seed - Deterministic seed for random selection (e.g., attempt ID)
 * @param ratios - Distribution ratios (defaults to 0.6/0.3/0.1)
 * @param masteryConfig - Optional mastery boost/penalty multipliers (Phase 6)
 * @param cooldownConfig - Optional cooldown scheduling config (Phase 7)
 * @param now - Current timestamp in ms for cooldown calculation (injected, Phase 7)
 * @returns Selected review questions (at most `count`; fewer if not enough questions)
 */
export function selectReviewQuestions(
  questions: Question[],
  telemetryList: QuestionTelemetry[],
  count: number,
  weights: WeaknessWeights,
  seed: string = "",
  ratios?: ReviewMixRatios,
  masteryConfig?: MasteryBoostConfig,
  cooldownConfig?: CooldownConfig,
  now?: number,
): ReviewQuestion[] {
  const effectiveCount = Math.max(0, Math.min(count, questions.length));

  if (effectiveCount === 0) {
    return [];
  }

  // Default ratios: 60/30/10
  const { weakRatio, mediumRatio } = ratios ?? {
    weakRatio: 0.6,
    mediumRatio: 0.3,
    randomRatio: 0.1,
  };

  // Compute target counts
  const weakTarget = Math.floor(effectiveCount * weakRatio);
  const mediumTarget = Math.floor(effectiveCount * mediumRatio);
  const randomTarget = effectiveCount - weakTarget - mediumTarget;

  // Build telemetry lookup
  const telemetryMap = new Map<number, QuestionTelemetry>();
  for (const t of telemetryList) {
    telemetryMap.set(t.questionNumber, t);
  }

  // Build review items for all questions
  const allItems: ReviewQuestion[] = questions.map((question) => {
    const existing = telemetryMap.get(question.number);
    const telemetry =
      existing ?? createInitialTelemetry("exam", question.number);
    const weakness = computeWeakScore(telemetry, weights);

    return {
      question,
      telemetry,
      weakness,
      isWeaknessBased: false,
    };
  });

  // Apply mastery boost/penalty if configured (Phase 6)
  if (masteryConfig) {
    applyMasteryBoost(
      allItems,
      questions,
      telemetryList,
      weights,
      masteryConfig,
    );
  }

  // Apply cooldown scheduling if configured (Phase 7)
  if (cooldownConfig && now != null) {
    const cooldownMap = applyCooldownScheduling(
      questions,
      telemetryList,
      now,
      cooldownConfig.cooldownWindowMs,
      cooldownConfig.cooldownMinMultiplier,
    );

    for (const item of allItems) {
      const multiplier = cooldownMap.get(item.question.number) ?? 1;
      item.weakness = item.weakness * multiplier;
    }
  }

  // Sort all items by weakness DESC (deterministic)
  sortByWeaknessDescending(allItems);

  // Track selected question numbers for deduplication
  const selected = new Set<number>();
  const result: ReviewQuestion[] = [];

  // --- Weak bucket: first weakTarget items from sorted list ---
  let weakCount = 0;
  let sortedIndex = 0;

  while (weakCount < weakTarget && sortedIndex < allItems.length) {
    const item = allItems[sortedIndex];
    sortedIndex++;
    if (!selected.has(item.question.number)) {
      selected.add(item.question.number);
      result.push({ ...item, isWeaknessBased: true });
      weakCount++;
    }
  }

  // If weak bucket underfilled, carry overflow to medium
  const weakOverflow = weakTarget - weakCount;

  // --- Medium bucket: next mediumTarget items from sorted list ---
  const adjustedMediumTarget = mediumTarget + weakOverflow;
  let mediumCount = 0;

  while (mediumCount < adjustedMediumTarget && sortedIndex < allItems.length) {
    const item = allItems[sortedIndex];
    sortedIndex++;
    if (!selected.has(item.question.number)) {
      selected.add(item.question.number);
      result.push({ ...item, isWeaknessBased: true });
      mediumCount++;
    }
  }

  // If medium bucket underfilled, carry overflow to random
  const mediumOverflow = adjustedMediumTarget - mediumCount;

  // --- Random/unseen bucket ---
  const adjustedRandomTarget = randomTarget + mediumOverflow;

  if (adjustedRandomTarget > 0) {
    // Collect unseen items not already selected
    const unseenItems = allItems.filter(
      (item) =>
        item.telemetry.totalSeen === 0 && !selected.has(item.question.number),
    );

    // Create seeded RNG from the seed string
    const rng = createSeededRNG(hashStringToSeed(seed));

    let randomlySelected: ReviewQuestion[] = [];

    if (unseenItems.length >= adjustedRandomTarget) {
      // Enough unseen: randomly sample
      randomlySelected = randomSampleWithoutReplacement({
        items: unseenItems,
        sampleSize: adjustedRandomTarget,
        rng,
      });
    } else {
      // Take all unseen
      randomlySelected = [...unseenItems];

      // Fill remainder with least recently seen (not already selected, not unseen)
      const remainingNeed = adjustedRandomTarget - randomlySelected.length;
      if (remainingNeed > 0) {
        const unseenNumbers = new Set(
          unseenItems.map((item) => item.question.number),
        );
        const candidatesForFallback = allItems.filter(
          (item) =>
            !selected.has(item.question.number) &&
            !unseenNumbers.has(item.question.number),
        );

        // Sort by lastSeenAt ASC for fallback
        const sortedFallback = sortByLastSeen(candidatesForFallback);
        const fallbackItems = sortedFallback.slice(0, remainingNeed);
        randomlySelected = [...randomlySelected, ...fallbackItems];
      }
    }

    // Add to result
    for (const item of randomlySelected) {
      if (!selected.has(item.question.number)) {
        selected.add(item.question.number);
        result.push({ ...item, isWeaknessBased: false });
      }
    }
  }

  return result;
}

/**
 * Apply mastery-based boost/penalty multipliers to weakness scores (Phase 6).
 *
 * For each question, determines the mastery level of its category (or the
 * worst mastery level if it belongs to multiple categories), then multiplies
 * its weakness score by the corresponding boost/penalty factor.
 *
 * Mutates the items array in place for efficiency (internal use only).
 *
 * @param items - Review items with computed weakness scores
 * @param questions - All questions (needed for category mastery computation)
 * @param telemetryList - Telemetry data
 * @param weights - Weakness calculation weights
 * @param config - Mastery boost/penalty configuration
 */
function applyMasteryBoost(
  items: ReviewQuestion[],
  questions: Question[],
  telemetryList: QuestionTelemetry[],
  weights: WeaknessWeights,
  config: MasteryBoostConfig,
): void {
  // Compute category mastery for all categories
  const masteryList = computeCategoryMastery(
    questions,
    telemetryList,
    weights,
    DEFAULT_MASTERY_THRESHOLDS,
  );

  // Build lookup: category → MasteryLevel
  const masteryMap = new Map<string, "weak" | "learning" | "mastered">();
  for (const cm of masteryList) {
    masteryMap.set(cm.category, cm.level);
  }

  // Mastery level priority: weak > learning > mastered
  const levelPriority: Record<string, number> = {
    weak: 2,
    learning: 1,
    mastered: 0,
  };

  // Multiplier lookup
  const multiplierForLevel: Record<string, number> = {
    weak: config.weakBoost,
    learning: config.learningBoost,
    mastered: config.masteredPenalty,
  };

  for (const item of items) {
    const categories = item.question.categoria;

    // Find the worst (highest priority) mastery level across all categories
    let worstLevel: "weak" | "learning" | "mastered" = "mastered";
    for (const cat of categories) {
      const level = masteryMap.get(cat) ?? "learning";
      if (levelPriority[level] > levelPriority[worstLevel]) {
        worstLevel = level;
      }
    }

    // Apply multiplier to weakness score
    item.weakness = item.weakness * multiplierForLevel[worstLevel];
  }
}
