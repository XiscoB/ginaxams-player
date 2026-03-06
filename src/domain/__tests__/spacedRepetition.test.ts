/**
 * Spaced Repetition Scheduling — Unit Tests (Phase 7)
 *
 * Tests cover:
 * - computeCooldownPenalty: boundary conditions, linear scaling, clamping
 * - applyCooldownScheduling: integration with questions/telemetry
 * - Edge cases: null/empty lastSeenAt, zero window, large timestamps
 * - Determinism and purity
 */

import { describe, it, expect } from "vitest";
import {
  computeCooldownPenalty,
  applyCooldownScheduling,
} from "../spacedRepetition.js";
import type { Question, QuestionTelemetry } from "../types.js";

// ============================================================================
// Test Helpers
// ============================================================================

function makeQuestion(
  number: number,
  categories: string[] = ["test"],
): Question {
  return {
    number,
    text: `Question ${number}`,
    categoria: categories,
    articulo_referencia: "Art. 1",
    feedback: {
      cita_literal: "Citation",
      explicacion_fallo: "Explanation",
    },
    answers: [
      { letter: "A", text: "A", isCorrect: true },
      { letter: "B", text: "B", isCorrect: false },
    ],
  };
}

function makeTelemetry(
  questionNumber: number,
  lastSeenAt: string,
  overrides: Partial<QuestionTelemetry> = {},
): QuestionTelemetry {
  return {
    id: `exam1_${questionNumber}`,
    examId: "exam1",
    questionNumber,
    timesCorrect: 0,
    timesWrong: 0,
    timesBlank: 0,
    consecutiveCorrect: 0,
    avgResponseTimeMs: 5000,
    totalSeen: lastSeenAt ? 1 : 0,
    lastSeenAt,
    ...overrides,
  };
}

// 5 minute cooldown window
const WINDOW_MS = 5 * 60 * 1000; // 300000
const MIN_MULT = 0.2;

// ============================================================================
// computeCooldownPenalty Tests
// ============================================================================

describe("computeCooldownPenalty", () => {
  it("returns 1 when lastSeenAt is null", () => {
    expect(computeCooldownPenalty(null, Date.now(), WINDOW_MS, MIN_MULT)).toBe(
      1,
    );
  });

  it("returns 1 when lastSeenAt is empty string", () => {
    expect(computeCooldownPenalty("", Date.now(), WINDOW_MS, MIN_MULT)).toBe(1);
  });

  it("returns 1 when elapsed >= cooldownWindowMs", () => {
    const now = 1000000;
    const lastSeen = new Date(now - WINDOW_MS).toISOString();
    expect(computeCooldownPenalty(lastSeen, now, WINDOW_MS, MIN_MULT)).toBe(1);
  });

  it("returns 1 when elapsed > cooldownWindowMs (well past)", () => {
    const now = 1000000000;
    const lastSeen = new Date(now - WINDOW_MS * 10).toISOString();
    expect(computeCooldownPenalty(lastSeen, now, WINDOW_MS, MIN_MULT)).toBe(1);
  });

  it("returns minMultiplier when just seen (elapsed ≈ 0)", () => {
    const now = 1000000000;
    const lastSeen = new Date(now).toISOString();
    // elapsed = 0 → multiplier should be minMultiplier (clamped floor)
    const result = computeCooldownPenalty(lastSeen, now, WINDOW_MS, MIN_MULT);
    expect(result).toBeCloseTo(MIN_MULT, 2);
  });

  it("returns scaled value at half cooldown window", () => {
    const now = 1000000000;
    const halfWindow = WINDOW_MS / 2;
    const lastSeen = new Date(now - halfWindow).toISOString();
    const result = computeCooldownPenalty(lastSeen, now, WINDOW_MS, MIN_MULT);
    // elapsed / window = 0.5
    expect(result).toBeCloseTo(0.5, 1);
  });

  it("returns scaled value at 80% of cooldown window", () => {
    const now = 1000000000;
    const elapsed = WINDOW_MS * 0.8;
    const lastSeen = new Date(now - elapsed).toISOString();
    const result = computeCooldownPenalty(lastSeen, now, WINDOW_MS, MIN_MULT);
    expect(result).toBeCloseTo(0.8, 1);
  });

  it("clamps to minMultiplier when elapsed is very small", () => {
    const now = 1000000000;
    // elapsed = 1ms → raw = 1/300000 ≈ 0.0000033, below minMultiplier
    const lastSeen = new Date(now - 1).toISOString();
    const result = computeCooldownPenalty(lastSeen, now, WINDOW_MS, MIN_MULT);
    expect(result).toBe(MIN_MULT);
  });

  it("returns minMultiplier when lastSeenAt is in the future", () => {
    const now = 1000000000;
    const lastSeen = new Date(now + 60000).toISOString();
    const result = computeCooldownPenalty(lastSeen, now, WINDOW_MS, MIN_MULT);
    expect(result).toBe(MIN_MULT);
  });

  it("returns 1 when cooldownWindowMs is 0 (no cooldown)", () => {
    const now = 1000000000;
    const lastSeen = new Date(now - 1000).toISOString();
    expect(computeCooldownPenalty(lastSeen, now, 0, MIN_MULT)).toBe(1);
  });

  it("returns 1 when cooldownWindowMs is negative", () => {
    const now = 1000000000;
    const lastSeen = new Date(now - 1000).toISOString();
    expect(computeCooldownPenalty(lastSeen, now, -1000, MIN_MULT)).toBe(1);
  });

  it("handles very large timestamps correctly", () => {
    const now = 2000000000000; // Year 2033
    const lastSeen = new Date(now - WINDOW_MS / 4).toISOString();
    const result = computeCooldownPenalty(lastSeen, now, WINDOW_MS, MIN_MULT);
    // elapsed/window = 0.25 → max(0.2, 0.25) = 0.25
    expect(result).toBeCloseTo(0.25, 1);
  });

  it("uses custom minMultiplier", () => {
    const now = 1000000000;
    const lastSeen = new Date(now - 1).toISOString();
    // Very small elapsed → raw ≈ 0, clamp to custom min 0.5
    const result = computeCooldownPenalty(lastSeen, now, WINDOW_MS, 0.5);
    expect(result).toBe(0.5);
  });

  it("handles minMultiplier of 0", () => {
    const now = 1000000000;
    const lastSeen = new Date(now).toISOString();
    const result = computeCooldownPenalty(lastSeen, now, WINDOW_MS, 0);
    // elapsed = 0 → raw = 0, min = 0 → result = 0
    expect(result).toBe(0);
  });

  it("handles minMultiplier of 1 (no penalty possible)", () => {
    const now = 1000000000;
    const lastSeen = new Date(now).toISOString();
    const result = computeCooldownPenalty(lastSeen, now, WINDOW_MS, 1);
    expect(result).toBe(1);
  });

  it("is deterministic (same inputs → same outputs)", () => {
    const now = 1000000000;
    const lastSeen = new Date(now - 60000).toISOString();
    const r1 = computeCooldownPenalty(lastSeen, now, WINDOW_MS, MIN_MULT);
    const r2 = computeCooldownPenalty(lastSeen, now, WINDOW_MS, MIN_MULT);
    const r3 = computeCooldownPenalty(lastSeen, now, WINDOW_MS, MIN_MULT);
    expect(r1).toBe(r2);
    expect(r2).toBe(r3);
  });

  it("returns value always in [0, 1]", () => {
    const testCases = [
      { lastSeen: null, now: 0 },
      { lastSeen: "", now: 0 },
      { lastSeen: new Date(0).toISOString(), now: 0 },
      { lastSeen: new Date(0).toISOString(), now: 100 },
      { lastSeen: new Date(1000000000).toISOString(), now: 1000000000 },
      {
        lastSeen: new Date(1000000000).toISOString(),
        now: 1000000000 + WINDOW_MS,
      },
    ];

    for (const tc of testCases) {
      const result = computeCooldownPenalty(
        tc.lastSeen,
        tc.now,
        WINDOW_MS,
        MIN_MULT,
      );
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(1);
    }
  });
});

// ============================================================================
// applyCooldownScheduling Tests
// ============================================================================

describe("applyCooldownScheduling", () => {
  it("returns empty map for empty questions", () => {
    const result = applyCooldownScheduling(
      [],
      [],
      1000000000,
      WINDOW_MS,
      MIN_MULT,
    );
    expect(result.size).toBe(0);
  });

  it("returns 1 for unseen questions (no telemetry)", () => {
    const questions = [makeQuestion(1), makeQuestion(2)];
    const result = applyCooldownScheduling(
      questions,
      [],
      1000000000,
      WINDOW_MS,
      MIN_MULT,
    );

    expect(result.get(1)).toBe(1);
    expect(result.get(2)).toBe(1);
  });

  it("returns 1 for questions with empty lastSeenAt", () => {
    const questions = [makeQuestion(1)];
    const telemetry = [makeTelemetry(1, "")];
    const result = applyCooldownScheduling(
      questions,
      telemetry,
      1000000000,
      WINDOW_MS,
      MIN_MULT,
    );

    expect(result.get(1)).toBe(1);
  });

  it("recently seen questions get low multiplier", () => {
    const now = 1000000000;
    const questions = [makeQuestion(1)];
    const telemetry = [makeTelemetry(1, new Date(now - 1000).toISOString())];

    const result = applyCooldownScheduling(
      questions,
      telemetry,
      now,
      WINDOW_MS,
      MIN_MULT,
    );

    // 1000ms elapsed / 300000ms window ≈ 0.003, below minMultiplier → 0.2
    expect(result.get(1)).toBe(MIN_MULT);
  });

  it("older questions regain full priority", () => {
    const now = 1000000000;
    const questions = [makeQuestion(1)];
    const telemetry = [
      makeTelemetry(1, new Date(now - WINDOW_MS - 1000).toISOString()),
    ];

    const result = applyCooldownScheduling(
      questions,
      telemetry,
      now,
      WINDOW_MS,
      MIN_MULT,
    );

    expect(result.get(1)).toBe(1);
  });

  it("handles mixed seen/unseen questions", () => {
    const now = 1000000000;
    const questions = [makeQuestion(1), makeQuestion(2), makeQuestion(3)];
    const telemetry = [
      makeTelemetry(1, new Date(now - 1000).toISOString()), // just seen
      // Q2: no telemetry
      makeTelemetry(3, new Date(now - WINDOW_MS * 2).toISOString()), // long ago
    ];

    const result = applyCooldownScheduling(
      questions,
      telemetry,
      now,
      WINDOW_MS,
      MIN_MULT,
    );

    expect(result.get(1)).toBe(MIN_MULT); // recently seen → penalized
    expect(result.get(2)).toBe(1); // unseen → no penalty
    expect(result.get(3)).toBe(1); // cooldown expired → no penalty
  });

  it("returns correct number of entries", () => {
    const questions = [makeQuestion(1), makeQuestion(2), makeQuestion(3)];
    const result = applyCooldownScheduling(
      questions,
      [],
      1000000000,
      WINDOW_MS,
      MIN_MULT,
    );
    expect(result.size).toBe(3);
  });

  it("does not mutate inputs", () => {
    const now = 1000000000;
    const questions = [makeQuestion(1)];
    const telemetry = [makeTelemetry(1, new Date(now - 1000).toISOString())];
    const questionsCopy = JSON.parse(JSON.stringify(questions));
    const telemetryCopy = JSON.parse(JSON.stringify(telemetry));

    applyCooldownScheduling(questions, telemetry, now, WINDOW_MS, MIN_MULT);

    expect(questions).toEqual(questionsCopy);
    expect(telemetry).toEqual(telemetryCopy);
  });

  it("is deterministic (same inputs → same outputs)", () => {
    const now = 1000000000;
    const questions = [makeQuestion(1), makeQuestion(2)];
    const telemetry = [makeTelemetry(1, new Date(now - 60000).toISOString())];

    const r1 = applyCooldownScheduling(
      questions,
      telemetry,
      now,
      WINDOW_MS,
      MIN_MULT,
    );
    const r2 = applyCooldownScheduling(
      questions,
      telemetry,
      now,
      WINDOW_MS,
      MIN_MULT,
    );

    expect(r1.get(1)).toBe(r2.get(1));
    expect(r1.get(2)).toBe(r2.get(2));
  });

  it("multiplier increases linearly with elapsed time", () => {
    const now = 1000000000;
    const questions = [makeQuestion(1), makeQuestion(2), makeQuestion(3)];
    const telemetry = [
      makeTelemetry(1, new Date(now - WINDOW_MS * 0.25).toISOString()), // 25%
      makeTelemetry(2, new Date(now - WINDOW_MS * 0.5).toISOString()), // 50%
      makeTelemetry(3, new Date(now - WINDOW_MS * 0.75).toISOString()), // 75%
    ];

    const result = applyCooldownScheduling(
      questions,
      telemetry,
      now,
      WINDOW_MS,
      MIN_MULT,
    );

    const m1 = result.get(1)!;
    const m2 = result.get(2)!;
    const m3 = result.get(3)!;

    // Should be increasing: 0.25 < 0.5 < 0.75
    expect(m1).toBeCloseTo(0.25, 1);
    expect(m2).toBeCloseTo(0.5, 1);
    expect(m3).toBeCloseTo(0.75, 1);
    expect(m1).toBeLessThan(m2);
    expect(m2).toBeLessThan(m3);
  });
});
