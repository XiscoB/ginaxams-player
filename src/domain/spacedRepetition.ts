/**
 * Spaced Repetition Scheduling — Pure Domain Logic (Phase 7)
 *
 * Prevents questions from appearing too frequently after they have just been
 * answered by applying a cooldown multiplier based on `lastSeenAt`.
 *
 * The cooldown does NOT remove questions from the pool — it reduces their
 * selection priority by multiplying into the final weakness score.
 *
 * Rules:
 * - Pure functions (no side effects, no mutation)
 * - Deterministic output (same inputs → same outputs)
 * - No Date.now() — `now` is always injected
 * - No imports from defaults, storage, or application layers
 * - lastSeenAt is an ISO 8601 string; conversion to epoch is done here
 */

import type { Question, QuestionTelemetry } from "./types.js";
import { createInitialTelemetry } from "./telemetry.js";

/**
 * Configuration for cooldown scheduling.
 */
export interface CooldownConfig {
  /** Duration of the cooldown window in milliseconds */
  cooldownWindowMs: number;
  /** Minimum multiplier (floor) — prevents full suppression */
  cooldownMinMultiplier: number;
}

/**
 * Compute the cooldown penalty multiplier for a single question.
 *
 * Returns a value in [cooldownMinMultiplier, 1]:
 * - 1.0 = no penalty (question is fully eligible)
 * - cooldownMinMultiplier = maximum penalty (just seen)
 *
 * Behavior:
 * - If lastSeenAt is null/empty → return 1 (unseen, no penalty)
 * - If elapsed >= cooldownWindowMs → return 1 (cooldown expired)
 * - Otherwise → linear interpolation: max(minMultiplier, elapsed / window)
 *
 * @param lastSeenAt - ISO 8601 timestamp of last answer, or null/empty if never seen
 * @param now - Current timestamp in milliseconds (injected, not from Date.now())
 * @param cooldownWindowMs - Duration of the cooldown window in milliseconds
 * @param cooldownMinMultiplier - Floor multiplier (default 0.2)
 * @returns Multiplier in [cooldownMinMultiplier, 1]
 */
export function computeCooldownPenalty(
  lastSeenAt: string | null,
  now: number,
  cooldownWindowMs: number,
  cooldownMinMultiplier: number = 0.2,
): number {
  // Unseen questions get no penalty
  if (lastSeenAt === null || lastSeenAt === "") {
    return 1;
  }

  // Edge case: zero window means no cooldown
  if (cooldownWindowMs <= 0) {
    return 1;
  }

  const lastSeenMs = new Date(lastSeenAt).getTime();

  // Guard against invalid dates
  if (Number.isNaN(lastSeenMs)) {
    return 1;
  }

  const elapsed = now - lastSeenMs;

  // Future lastSeenAt or just seen → minimum multiplier
  if (elapsed <= 0) {
    return Math.max(0, Math.min(1, cooldownMinMultiplier));
  }

  // Cooldown expired → no penalty
  if (elapsed >= cooldownWindowMs) {
    return 1;
  }

  // Linear interpolation within cooldown window
  const raw = elapsed / cooldownWindowMs;

  // Clamp to [cooldownMinMultiplier, 1]
  return Math.max(
    Math.max(0, Math.min(1, cooldownMinMultiplier)),
    Math.min(1, raw),
  );
}

/**
 * Compute cooldown multipliers for all questions.
 *
 * Returns a Map from questionNumber to cooldownMultiplier.
 * Unseen questions (no telemetry or empty lastSeenAt) get multiplier 1.
 *
 * @param questions - All questions from the exam(s)
 * @param telemetry - Existing telemetry for some/all questions
 * @param now - Current timestamp in milliseconds (injected)
 * @param cooldownWindowMs - Duration of the cooldown window in milliseconds
 * @param cooldownMinMultiplier - Floor multiplier
 * @returns Map of questionNumber → cooldownMultiplier
 */
export function applyCooldownScheduling(
  questions: Question[],
  telemetry: QuestionTelemetry[],
  now: number,
  cooldownWindowMs: number,
  cooldownMinMultiplier: number = 0.2,
): Map<number, number> {
  // Build telemetry lookup by questionNumber
  const telemetryMap = new Map<number, QuestionTelemetry>();
  for (const t of telemetry) {
    telemetryMap.set(t.questionNumber, t);
  }

  const result = new Map<number, number>();

  for (const question of questions) {
    const qt =
      telemetryMap.get(question.number) ??
      createInitialTelemetry("exam", question.number);

    const multiplier = computeCooldownPenalty(
      qt.lastSeenAt,
      now,
      cooldownWindowMs,
      cooldownMinMultiplier,
    );

    result.set(question.number, multiplier);
  }

  return result;
}
