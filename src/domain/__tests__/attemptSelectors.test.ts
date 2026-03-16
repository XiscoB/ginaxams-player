/**
 * Attempt Selectors Unit Tests
 *
 * Pure domain tests for deriving statistics from Attempt data.
 */

import { describe, it, expect } from "vitest";
import {
  getAttemptStatsForExam,
  getAttemptCounts,
  hasAttempts,
  getMostRecentAttempt,
} from "../attemptSelectors.js";
import type { Attempt, FreeAttempt, SimulacroAttempt, AttemptResult } from "../types.js";

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockAttempt(
  id: string,
  examId: string,
  createdAt: string,
  score?: number
): Attempt {
  const base: Attempt = {
    id,
    type: "free",
    createdAt,
    sourceExamIds: [examId],
    config: {},
  } as FreeAttempt;

  if (score !== undefined) {
    (base as Attempt & { result: AttemptResult }).result = {
      correct: Math.round((score / 100) * 10),
      wrong: 0,
      blank: 0,
      score,
      percentage: score,
    };
  }

  return base;
}

function createSimulacroAttempt(
  id: string,
  examId: string,
  createdAt: string,
  score: number
): SimulacroAttempt {
  return {
    id,
    type: "simulacro",
    createdAt,
    sourceExamIds: [examId],
    config: {
      questionCount: 60,
      timeLimitMs: 600000,
      penalty: 0,
      reward: 1,
      examWeights: { [examId]: 1 },
    },
    result: {
      correct: Math.round((score / 100) * 60),
      wrong: 0,
      blank: 0,
      score,
      percentage: score,
    },
  };
}

// ============================================================================
// Test Suite
// ============================================================================

describe("Attempt Selectors", () => {
  describe("getAttemptStatsForExam", () => {
    it("should return undefined for no attempts", () => {
      const attempts: Attempt[] = [];
      const stats = getAttemptStatsForExam(attempts, "exam-1");
      expect(stats).toBeUndefined();
    });

    it("should return attempt count for single attempt", () => {
      const attempts: Attempt[] = [
        createMockAttempt("att-1", "exam-1", "2024-01-01T00:00:00Z", 75),
      ];
      const stats = getAttemptStatsForExam(attempts, "exam-1");

      expect(stats).toBeDefined();
      expect(stats?.attemptCount).toBe(1);
      expect(stats?.lastScore).toBe(75);
      expect(stats?.bestScore).toBe(75);
    });

    it("should calculate last score from most recent attempt", () => {
      const attempts: Attempt[] = [
        createMockAttempt("att-1", "exam-1", "2024-01-01T00:00:00Z", 60),
        createMockAttempt("att-2", "exam-1", "2024-01-03T00:00:00Z", 80),
        createMockAttempt("att-3", "exam-1", "2024-01-02T00:00:00Z", 70),
      ];
      const stats = getAttemptStatsForExam(attempts, "exam-1");

      expect(stats?.attemptCount).toBe(3);
      expect(stats?.lastScore).toBe(80); // Most recent
      expect(stats?.bestScore).toBe(80); // Highest
    });

    it("should calculate best score correctly", () => {
      const attempts: Attempt[] = [
        createMockAttempt("att-1", "exam-1", "2024-01-01T00:00:00Z", 90),
        createMockAttempt("att-2", "exam-1", "2024-01-02T00:00:00Z", 70),
        createMockAttempt("att-3", "exam-1", "2024-01-03T00:00:00Z", 80),
      ];
      const stats = getAttemptStatsForExam(attempts, "exam-1");

      expect(stats?.lastScore).toBe(80); // Most recent
      expect(stats?.bestScore).toBe(90); // Highest ever
    });

    it("should filter by examId", () => {
      const attempts: Attempt[] = [
        createMockAttempt("att-1", "exam-1", "2024-01-01T00:00:00Z", 80),
        createMockAttempt("att-2", "exam-2", "2024-01-02T00:00:00Z", 90),
        createMockAttempt("att-3", "exam-1", "2024-01-03T00:00:00Z", 85),
      ];
      const stats = getAttemptStatsForExam(attempts, "exam-1");

      expect(stats?.attemptCount).toBe(2);
      expect(stats?.lastScore).toBe(85);
      expect(stats?.bestScore).toBe(85);
    });

    it("should handle incomplete attempts (no result)", () => {
      const attempts: Attempt[] = [
        createMockAttempt("att-1", "exam-1", "2024-01-01T00:00:00Z"), // No score
        createMockAttempt("att-2", "exam-1", "2024-01-02T00:00:00Z", 75),
      ];
      const stats = getAttemptStatsForExam(attempts, "exam-1");

      expect(stats?.attemptCount).toBe(2);
      expect(stats?.lastScore).toBe(75);
      expect(stats?.bestScore).toBe(75);
    });

    it("should return only count if no completed attempts", () => {
      const attempts: Attempt[] = [
        createMockAttempt("att-1", "exam-1", "2024-01-01T00:00:00Z"), // No score
        createMockAttempt("att-2", "exam-1", "2024-01-02T00:00:00Z"), // No score
      ];
      const stats = getAttemptStatsForExam(attempts, "exam-1");

      expect(stats?.attemptCount).toBe(2);
      expect(stats?.lastScore).toBeUndefined();
      expect(stats?.bestScore).toBeUndefined();
    });

    it("should handle mixed attempt types", () => {
      const attempts: Attempt[] = [
        createMockAttempt("att-1", "exam-1", "2024-01-01T00:00:00Z", 70),
        createSimulacroAttempt("att-2", "exam-1", "2024-01-02T00:00:00Z", 85),
      ];
      const stats = getAttemptStatsForExam(attempts, "exam-1");

      expect(stats?.attemptCount).toBe(2);
      expect(stats?.lastScore).toBe(85);
      expect(stats?.bestScore).toBe(85);
    });

    it("should be deterministic", () => {
      const attempts: Attempt[] = [
        createMockAttempt("att-1", "exam-1", "2024-01-01T00:00:00Z", 75),
        createMockAttempt("att-2", "exam-1", "2024-01-02T00:00:00Z", 85),
        createMockAttempt("att-3", "exam-1", "2024-01-03T00:00:00Z", 80),
      ];

      const stats1 = getAttemptStatsForExam(attempts, "exam-1");
      const stats2 = getAttemptStatsForExam(attempts, "exam-1");

      expect(stats1).toEqual(stats2);
    });

    it("should handle multi-exam attempts", () => {
      const attempts: Attempt[] = [
        {
          id: "att-1",
          type: "simulacro",
          createdAt: "2024-01-01T00:00:00Z",
          sourceExamIds: ["exam-1", "exam-2"],
          config: {
            questionCount: 60,
            timeLimitMs: 600000,
            penalty: 0,
            reward: 1,
            examWeights: { "exam-1": 0.5, "exam-2": 0.5 },
          },
          result: {
            correct: 50,
            wrong: 10,
            blank: 0,
            score: 83,
            percentage: 83,
          },
        },
      ];

      const stats1 = getAttemptStatsForExam(attempts, "exam-1");
      const stats2 = getAttemptStatsForExam(attempts, "exam-2");

      expect(stats1?.attemptCount).toBe(1);
      expect(stats2?.attemptCount).toBe(1);
      expect(stats1?.bestScore).toBe(83);
      expect(stats2?.bestScore).toBe(83);
    });
  });

  describe("getAttemptCounts", () => {
    it("should return counts for multiple exams", () => {
      const attempts: Attempt[] = [
        createMockAttempt("att-1", "exam-1", "2024-01-01T00:00:00Z"),
        createMockAttempt("att-2", "exam-1", "2024-01-02T00:00:00Z"),
        createMockAttempt("att-3", "exam-2", "2024-01-03T00:00:00Z"),
      ];
      const counts = getAttemptCounts(attempts, ["exam-1", "exam-2", "exam-3"]);

      expect(counts.get("exam-1")).toBe(2);
      expect(counts.get("exam-2")).toBe(1);
      expect(counts.get("exam-3")).toBe(0);
    });
  });

  describe("hasAttempts", () => {
    it("should return true when attempts exist", () => {
      const attempts: Attempt[] = [
        createMockAttempt("att-1", "exam-1", "2024-01-01T00:00:00Z"),
      ];
      expect(hasAttempts(attempts, "exam-1")).toBe(true);
    });

    it("should return false when no attempts exist", () => {
      const attempts: Attempt[] = [];
      expect(hasAttempts(attempts, "exam-1")).toBe(false);
    });

    it("should return false for different exam", () => {
      const attempts: Attempt[] = [
        createMockAttempt("att-1", "exam-1", "2024-01-01T00:00:00Z"),
      ];
      expect(hasAttempts(attempts, "exam-2")).toBe(false);
    });
  });

  describe("getMostRecentAttempt", () => {
    it("should return the most recent attempt", () => {
      const attempts: Attempt[] = [
        createMockAttempt("att-1", "exam-1", "2024-01-01T00:00:00Z"),
        createMockAttempt("att-2", "exam-1", "2024-01-03T00:00:00Z"),
        createMockAttempt("att-3", "exam-1", "2024-01-02T00:00:00Z"),
      ];
      const recent = getMostRecentAttempt(attempts, "exam-1");

      expect(recent?.id).toBe("att-2");
    });

    it("should return undefined for no attempts", () => {
      const attempts: Attempt[] = [];
      const recent = getMostRecentAttempt(attempts, "exam-1");
      expect(recent).toBeUndefined();
    });
  });
});
