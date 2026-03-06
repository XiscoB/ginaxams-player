/**
 * Trap Question Detection — Unit Tests (Phase 9)
 *
 * Tests cover:
 * - masteryLevelToScore: numeric conversion of mastery levels
 * - computeTrapScore: raw trap score from difficulty × mastery
 * - classifyTrap: threshold-based classification
 * - computeTrapSignals: full aggregation across questions
 * - Edge cases: empty data, multi-category questions, extreme values
 * - Input immutability
 * - Deterministic ordering
 */

import { describe, it, expect } from "vitest";
import {
  masteryLevelToScore,
  computeTrapScore,
  classifyTrap,
  computeTrapSignals,
  type TrapThresholds,
} from "../trapDetection.js";
import type { Question, QuestionTelemetry, CategoryMastery } from "../types.js";

// ============================================================================
// Test Fixtures
// ============================================================================

const defaultThresholds: TrapThresholds = {
  possibleThreshold: 0.4,
  confirmedThreshold: 0.7,
};

function makeQuestion(
  number: number,
  categories: string[] = ["test"],
): Question {
  return {
    number,
    text: `Question ${number}`,
    categoria: categories,
    articulo_referencia: `Art. ${number}`,
    feedback: {
      cita_literal: "Citation",
      explicacion_fallo: "Explanation",
    },
    answers: [
      { letter: "A", text: "Wrong", isCorrect: false },
      { letter: "B", text: "Correct", isCorrect: true },
    ],
  };
}

function makeTelemetry(
  questionNumber: number,
  overrides: Partial<QuestionTelemetry> = {},
): QuestionTelemetry {
  return {
    id: `exam-1::${questionNumber}`,
    examId: "exam-1",
    questionNumber,
    timesCorrect: 0,
    timesWrong: 0,
    timesBlank: 0,
    consecutiveCorrect: 0,
    avgResponseTimeMs: 5000,
    totalSeen: 0,
    lastSeenAt: "",
    ...overrides,
  };
}

function makeMastery(
  category: string,
  level: "weak" | "learning" | "mastered",
): CategoryMastery {
  return {
    category,
    weaknessScore: level === "weak" ? 3.0 : level === "learning" ? 1.0 : 0.2,
    accuracy: level === "mastered" ? 0.9 : level === "learning" ? 0.6 : 0.2,
    level,
  };
}

// ============================================================================
// masteryLevelToScore Tests
// ============================================================================

describe("masteryLevelToScore", () => {
  it("returns 1.0 for mastered", () => {
    expect(masteryLevelToScore("mastered")).toBe(1.0);
  });

  it("returns 0.5 for learning", () => {
    expect(masteryLevelToScore("learning")).toBe(0.5);
  });

  it("returns 0.0 for weak", () => {
    expect(masteryLevelToScore("weak")).toBe(0.0);
  });
});

// ============================================================================
// computeTrapScore Tests
// ============================================================================

describe("computeTrapScore", () => {
  it("returns 0 when difficulty is 0", () => {
    expect(computeTrapScore(0, 1.0)).toBe(0);
  });

  it("returns 0 when mastery is 0", () => {
    expect(computeTrapScore(0.8, 0)).toBe(0);
  });

  it("multiplies difficulty × mastery", () => {
    expect(computeTrapScore(0.8, 1.0)).toBeCloseTo(0.8);
    expect(computeTrapScore(0.5, 0.5)).toBeCloseTo(0.25);
  });

  it("clamps result to [0, 1]", () => {
    expect(computeTrapScore(1.5, 1.0)).toBe(1.0);
    expect(computeTrapScore(-0.5, 1.0)).toBe(0);
  });
});

// ============================================================================
// classifyTrap Tests
// ============================================================================

describe("classifyTrap", () => {
  it("returns 'none' below possibleThreshold", () => {
    expect(classifyTrap(0, defaultThresholds)).toBe("none");
    expect(classifyTrap(0.39, defaultThresholds)).toBe("none");
  });

  it("returns 'possible' at possibleThreshold", () => {
    expect(classifyTrap(0.4, defaultThresholds)).toBe("possible");
  });

  it("returns 'possible' between thresholds", () => {
    expect(classifyTrap(0.5, defaultThresholds)).toBe("possible");
    expect(classifyTrap(0.69, defaultThresholds)).toBe("possible");
  });

  it("returns 'confirmed' at confirmedThreshold", () => {
    expect(classifyTrap(0.7, defaultThresholds)).toBe("confirmed");
  });

  it("returns 'confirmed' above confirmedThreshold", () => {
    expect(classifyTrap(0.9, defaultThresholds)).toBe("confirmed");
    expect(classifyTrap(1.0, defaultThresholds)).toBe("confirmed");
  });
});

// ============================================================================
// computeTrapSignals Tests
// ============================================================================

describe("computeTrapSignals", () => {
  it("high mastery + high difficulty → confirmed trap", () => {
    const questions = [makeQuestion(1, ["math"])];
    const telemetry = [
      makeTelemetry(1, { timesWrong: 8, timesBlank: 0, totalSeen: 10 }),
    ];
    const mastery = [makeMastery("math", "mastered")];

    const signals = computeTrapSignals(
      questions,
      telemetry,
      mastery,
      defaultThresholds,
    );

    expect(signals).toHaveLength(1);
    expect(signals[0].trapScore).toBeCloseTo(0.8); // 0.8 difficulty × 1.0 mastery
    expect(signals[0].trapLevel).toBe("confirmed");
  });

  it("low mastery + high difficulty → normal weakness (none)", () => {
    const questions = [makeQuestion(1, ["math"])];
    const telemetry = [
      makeTelemetry(1, { timesWrong: 8, timesBlank: 0, totalSeen: 10 }),
    ];
    const mastery = [makeMastery("math", "weak")];

    const signals = computeTrapSignals(
      questions,
      telemetry,
      mastery,
      defaultThresholds,
    );

    expect(signals).toHaveLength(1);
    expect(signals[0].trapScore).toBeCloseTo(0); // 0.8 difficulty × 0.0 mastery
    expect(signals[0].trapLevel).toBe("none");
  });

  it("learning mastery + high difficulty → possible trap", () => {
    const questions = [makeQuestion(1, ["math"])];
    const telemetry = [
      makeTelemetry(1, { timesWrong: 9, timesBlank: 0, totalSeen: 10 }),
    ];
    const mastery = [makeMastery("math", "learning")];

    const signals = computeTrapSignals(
      questions,
      telemetry,
      mastery,
      defaultThresholds,
    );

    expect(signals).toHaveLength(1);
    expect(signals[0].trapScore).toBeCloseTo(0.45); // 0.9 × 0.5
    expect(signals[0].trapLevel).toBe("possible");
  });

  it("produces deterministic output sorted by questionNumber", () => {
    const questions = [makeQuestion(3), makeQuestion(1), makeQuestion(2)];
    const telemetry = [
      makeTelemetry(1, { timesWrong: 5, totalSeen: 10 }),
      makeTelemetry(2, { timesWrong: 3, totalSeen: 10 }),
      makeTelemetry(3, { timesWrong: 8, totalSeen: 10 }),
    ];
    const mastery = [makeMastery("test", "mastered")];

    const signals = computeTrapSignals(
      questions,
      telemetry,
      mastery,
      defaultThresholds,
    );

    expect(signals.map((s) => s.questionNumber)).toEqual([1, 2, 3]);

    // Run again to verify determinism
    const signals2 = computeTrapSignals(
      questions,
      telemetry,
      mastery,
      defaultThresholds,
    );
    expect(signals2).toEqual(signals);
  });

  it("handles multi-category questions (uses max mastery)", () => {
    const questions = [makeQuestion(1, ["math", "science"])];
    const telemetry = [makeTelemetry(1, { timesWrong: 8, totalSeen: 10 })];
    const mastery = [
      makeMastery("math", "weak"),
      makeMastery("science", "mastered"),
    ];

    const signals = computeTrapSignals(
      questions,
      telemetry,
      mastery,
      defaultThresholds,
    );

    // Should use max mastery (mastered = 1.0), not weak (0.0)
    expect(signals[0].trapScore).toBeCloseTo(0.8); // 0.8 × 1.0
    expect(signals[0].trapLevel).toBe("confirmed");
  });

  it("returns none for questions without telemetry", () => {
    const questions = [makeQuestion(1, ["math"])];
    const mastery = [makeMastery("math", "mastered")];

    const signals = computeTrapSignals(
      questions,
      [],
      mastery,
      defaultThresholds,
    );

    expect(signals).toHaveLength(1);
    expect(signals[0].trapScore).toBe(0); // no telemetry → difficulty 0
    expect(signals[0].trapLevel).toBe("none");
  });

  it("returns empty array for empty questions", () => {
    const signals = computeTrapSignals([], [], [], defaultThresholds);
    expect(signals).toEqual([]);
  });

  it("returns none when category mastery is not found", () => {
    const questions = [makeQuestion(1, ["unknown"])];
    const telemetry = [makeTelemetry(1, { timesWrong: 8, totalSeen: 10 })];
    const mastery = [makeMastery("math", "mastered")];

    const signals = computeTrapSignals(
      questions,
      telemetry,
      mastery,
      defaultThresholds,
    );

    expect(signals[0].trapScore).toBe(0); // no matching mastery → 0
    expect(signals[0].trapLevel).toBe("none");
  });

  it("does not mutate inputs", () => {
    const questions = [makeQuestion(1, ["math"])];
    const telemetry = [makeTelemetry(1, { timesWrong: 5, totalSeen: 10 })];
    const mastery = [makeMastery("math", "mastered")];

    const questionsCopy = JSON.parse(JSON.stringify(questions));
    const telemetryCopy = JSON.parse(JSON.stringify(telemetry));
    const masteryCopy = JSON.parse(JSON.stringify(mastery));

    computeTrapSignals(questions, telemetry, mastery, defaultThresholds);

    expect(questions).toEqual(questionsCopy);
    expect(telemetry).toEqual(telemetryCopy);
    expect(mastery).toEqual(masteryCopy);
  });

  it("handles extreme values", () => {
    const questions = [makeQuestion(1, ["math"])];
    const telemetry = [makeTelemetry(1, { timesWrong: 1000, totalSeen: 1000 })];
    const mastery = [makeMastery("math", "mastered")];

    const signals = computeTrapSignals(
      questions,
      telemetry,
      mastery,
      defaultThresholds,
    );

    expect(signals[0].trapScore).toBe(1.0); // 1.0 × 1.0 = 1.0
    expect(signals[0].trapLevel).toBe("confirmed");
  });
});
