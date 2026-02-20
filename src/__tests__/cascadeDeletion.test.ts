/**
 * Cascade Deletion Unit Tests
 *
 * Tests for cascade deletion logic in the storage layer.
 * These tests verify that deleting exams properly cascades to
 * related telemetry and attempts.
 *
 * Note: These tests mock the IndexedDB layer to focus on the
 * cascade logic without actual database dependencies.
 */

import { describe, it, expect, beforeEach } from "vitest";
import type {
  StoredExam,
  Attempt,
  QuestionTelemetry,
  Exam,
} from "../domain/types.js";

// ============================================================================
// Mock Types and Helpers
// ============================================================================

interface MockStore {
  data: Map<string, unknown>;
  indexes: Map<string, Map<string, string[]>>;
}

interface MockDB {
  stores: Map<string, MockStore>;
}

// Create a mock exam
function createMockExam(id: string, folderId = "uncategorized"): StoredExam {
  const examData: Exam = {
    schema_version: "2.0",
    exam_id: `exam-data-${id}`,
    title: `Test Exam ${id}`,
    categorias: ["test"],
    total_questions: 10,
    questions: [],
  };

  return {
    id,
    title: examData.title,
    data: examData,
    addedAt: new Date().toISOString(),
    folderId,
  };
}

// Create a mock attempt
function createMockAttempt(
  id: string,
  type: Attempt["type"],
  sourceExamIds: string[],
  parentAttemptId?: string
): Attempt {
  if (type === "simulacro") {
    return {
      id,
      type: "simulacro",
      createdAt: new Date().toISOString(),
      sourceExamIds,
      config: {
        questionCount: 10,
        timeLimitMs: 60000,
        penalty: 0.25,
        reward: 1,
        examWeights: Object.fromEntries(sourceExamIds.map((id) => [id, 1])),
      },
      parentAttemptId,
    };
  }
  if (type === "review") {
    return {
      id,
      type: "review",
      createdAt: new Date().toISOString(),
      sourceExamIds,
      config: { questionCount: 10 },
      parentAttemptId,
    };
  }
  return {
    id,
    type: "free",
    createdAt: new Date().toISOString(),
    sourceExamIds,
    config: {},
    parentAttemptId,
  };
}

// Create mock telemetry
function createMockTelemetry(
  examId: string,
  questionNumber: number
): QuestionTelemetry {
  return {
    id: `${examId}::${questionNumber}`,
    examId,
    questionNumber,
    timesCorrect: 0,
    timesWrong: 0,
    timesBlank: 0,
    consecutiveCorrect: 0,
    avgResponseTimeMs: 0,
    totalSeen: 0,
    lastSeenAt: "",
  };
}

// ============================================================================
// Mock Storage Implementation
// ============================================================================

class MockExamStorage {
  private db: MockDB;

  constructor() {
    this.db = {
      stores: new Map([
        ["exams", { data: new Map(), indexes: new Map() }],
        ["folders", { data: new Map(), indexes: new Map() }],
        ["progress", { data: new Map(), indexes: new Map() }],
        ["attempts", { data: new Map(), indexes: new Map() }],
        ["questionTelemetry", { data: new Map(), indexes: new Map() }],
      ]),
    };
  }

  // Store helpers
  private getStore(name: string): MockStore {
    const store = this.db.stores.get(name);
    if (!store) throw new Error(`Store ${name} not found`);
    return store;
  }

  // Exam operations
  async saveExam(exam: StoredExam): Promise<string> {
    const store = this.getStore("exams");
    store.data.set(exam.id, { ...exam });
    return exam.id;
  }

  async getExam(id: string): Promise<StoredExam | undefined> {
    const store = this.getStore("exams");
    return store.data.get(id) as StoredExam | undefined;
  }

  async getExams(): Promise<StoredExam[]> {
    const store = this.getStore("exams");
    return Array.from(store.data.values()) as StoredExam[];
  }

  // Cascade deletion implementation (mirrors real storage)
  async deleteExam(id: string): Promise<void> {
    const examStore = this.getStore("exams");
    const progressStore = this.getStore("progress");
    const telemetryStore = this.getStore("questionTelemetry");
    const attemptsStore = this.getStore("attempts");

    // Delete exam
    examStore.data.delete(id);

    // Delete associated progress
    progressStore.data.delete(id);

    // Delete telemetry for this exam
    const telemetryToDelete: string[] = [];
    for (const [key, value] of telemetryStore.data) {
      const t = value as QuestionTelemetry;
      if (t.examId === id) {
        telemetryToDelete.push(key);
      }
    }
    for (const key of telemetryToDelete) {
      telemetryStore.data.delete(key);
    }

    // Delete attempts that reference this exam
    const attemptsToDelete: string[] = [];
    for (const [key, value] of attemptsStore.data) {
      const a = value as Attempt;
      if (a.sourceExamIds.includes(id)) {
        attemptsToDelete.push(key);
      }
    }
    for (const key of attemptsToDelete) {
      attemptsStore.data.delete(key);
    }
  }

  // Attempt operations
  async saveAttempt(attempt: Attempt): Promise<string> {
    const store = this.getStore("attempts");
    store.data.set(attempt.id, { ...attempt });
    return attempt.id;
  }

  async getAttempt(id: string): Promise<Attempt | undefined> {
    const store = this.getStore("attempts");
    return store.data.get(id) as Attempt | undefined;
  }

  async getAllAttempts(): Promise<Attempt[]> {
    const store = this.getStore("attempts");
    return Array.from(store.data.values()) as Attempt[];
  }

  // Telemetry operations
  async saveQuestionTelemetry(telemetry: QuestionTelemetry): Promise<void> {
    const store = this.getStore("questionTelemetry");
    store.data.set(telemetry.id, { ...telemetry });
  }

  async getQuestionTelemetry(
    examId: string,
    questionNumber: number
  ): Promise<QuestionTelemetry | undefined> {
    const store = this.getStore("questionTelemetry");
    return store.data.get(`${examId}::${questionNumber}`) as
      | QuestionTelemetry
      | undefined;
  }

  async getTelemetryByExam(examId: string): Promise<QuestionTelemetry[]> {
    const store = this.getStore("questionTelemetry");
    const result: QuestionTelemetry[] = [];
    for (const value of store.data.values()) {
      const t = value as QuestionTelemetry;
      if (t.examId === examId) {
        result.push(t);
      }
    }
    return result;
  }

  // Global telemetry reset (does not delete exams or attempts)
  async clearAllQuestionTelemetry(): Promise<void> {
    const store = this.getStore("questionTelemetry");
    store.data.clear();
  }

  // Clear all (for testing)
  async clearAll(): Promise<void> {
    for (const store of this.db.stores.values()) {
      store.data.clear();
    }
  }
}

// ============================================================================
// Tests
// ============================================================================

describe("Cascade Deletion", () => {
  let storage: MockExamStorage;

  beforeEach(() => {
    storage = new MockExamStorage();
  });

  describe("deleteExam", () => {
    it("deletes the exam itself", async () => {
      const exam = createMockExam("exam-1");
      await storage.saveExam(exam);

      await storage.deleteExam("exam-1");

      const result = await storage.getExam("exam-1");
      expect(result).toBeUndefined();
    });

    it("deletes telemetry for the exam", async () => {
      const exam = createMockExam("exam-1");
      await storage.saveExam(exam);

      const telemetry1 = createMockTelemetry("exam-1", 1);
      const telemetry2 = createMockTelemetry("exam-1", 2);
      await storage.saveQuestionTelemetry(telemetry1);
      await storage.saveQuestionTelemetry(telemetry2);

      await storage.deleteExam("exam-1");

      const result1 = await storage.getQuestionTelemetry("exam-1", 1);
      const result2 = await storage.getQuestionTelemetry("exam-1", 2);
      expect(result1).toBeUndefined();
      expect(result2).toBeUndefined();
    });

    it("deletes attempts that reference the exam", async () => {
      const exam = createMockExam("exam-1");
      await storage.saveExam(exam);

      const attempt1 = createMockAttempt("att-1", "simulacro", ["exam-1"]);
      const attempt2 = createMockAttempt("att-2", "review", ["exam-1", "exam-2"]);
      await storage.saveAttempt(attempt1);
      await storage.saveAttempt(attempt2);

      await storage.deleteExam("exam-1");

      const result1 = await storage.getAttempt("att-1");
      const result2 = await storage.getAttempt("att-2");
      expect(result1).toBeUndefined();
      expect(result2).toBeUndefined();
    });

    it("preserves telemetry for other exams", async () => {
      const exam1 = createMockExam("exam-1");
      const exam2 = createMockExam("exam-2");
      await storage.saveExam(exam1);
      await storage.saveExam(exam2);

      const telemetry1 = createMockTelemetry("exam-1", 1);
      const telemetry2 = createMockTelemetry("exam-2", 1);
      await storage.saveQuestionTelemetry(telemetry1);
      await storage.saveQuestionTelemetry(telemetry2);

      await storage.deleteExam("exam-1");

      const result = await storage.getQuestionTelemetry("exam-2", 1);
      expect(result).toBeDefined();
      expect(result!.examId).toBe("exam-2");
    });

    it("preserves attempts that do not reference the deleted exam", async () => {
      const exam1 = createMockExam("exam-1");
      const exam2 = createMockExam("exam-2");
      await storage.saveExam(exam1);
      await storage.saveExam(exam2);

      const attempt1 = createMockAttempt("att-1", "simulacro", ["exam-1"]);
      const attempt2 = createMockAttempt("att-2", "simulacro", ["exam-2"]);
      await storage.saveAttempt(attempt1);
      await storage.saveAttempt(attempt2);

      await storage.deleteExam("exam-1");

      const result = await storage.getAttempt("att-2");
      expect(result).toBeDefined();
      expect(result!.sourceExamIds).toContain("exam-2");
    });

    it("handles deletion of non-existent exam gracefully", async () => {
      // Should not throw
      await expect(storage.deleteExam("non-existent")).resolves.not.toThrow();
    });

    it("completely isolates deleted exam data", async () => {
      // Setup multiple exams with telemetry and attempts
      for (let i = 1; i <= 3; i++) {
        const exam = createMockExam(`exam-${i}`);
        await storage.saveExam(exam);

        // Add telemetry
        for (let q = 1; q <= 3; q++) {
          await storage.saveQuestionTelemetry(
            createMockTelemetry(`exam-${i}`, q)
          );
        }

        // Add attempts
        await storage.saveAttempt(
          createMockAttempt(`att-${i}-1`, "simulacro", [`exam-${i}`])
        );
        await storage.saveAttempt(
          createMockAttempt(`att-${i}-2`, "review", [`exam-${i}`])
        );
      }

      // Add cross-exam attempt
      await storage.saveAttempt(
        createMockAttempt("att-cross", "simulacro", ["exam-1", "exam-2"])
      );

      // Delete exam-1
      await storage.deleteExam("exam-1");

      // Verify exam-1 data is gone
      expect(await storage.getExam("exam-1")).toBeUndefined();
      expect(await storage.getQuestionTelemetry("exam-1", 1)).toBeUndefined();
      expect(await storage.getAttempt("att-1-1")).toBeUndefined();
      expect(await storage.getAttempt("att-1-2")).toBeUndefined();

      // Cross-exam attempt should also be deleted (references exam-1)
      expect(await storage.getAttempt("att-cross")).toBeUndefined();

      // Verify exam-2 and exam-3 data remains
      expect(await storage.getExam("exam-2")).toBeDefined();
      expect(await storage.getExam("exam-3")).toBeDefined();
      expect(await storage.getQuestionTelemetry("exam-2", 1)).toBeDefined();
      expect(await storage.getQuestionTelemetry("exam-3", 1)).toBeDefined();
      expect(await storage.getAttempt("att-2-1")).toBeDefined();
      expect(await storage.getAttempt("att-3-1")).toBeDefined();

      // Verify counts
      const remainingExams = await storage.getExams();
      expect(remainingExams).toHaveLength(2);

      const remainingAttempts = await storage.getAllAttempts();
      expect(remainingAttempts).toHaveLength(4); // 2 per remaining exam
    });
  });

  describe("clearAllQuestionTelemetry (Global Reset)", () => {
    it("clears all telemetry", async () => {
      // Setup exams with telemetry
      for (let i = 1; i <= 2; i++) {
        const exam = createMockExam(`exam-${i}`);
        await storage.saveExam(exam);
        for (let q = 1; q <= 3; q++) {
          await storage.saveQuestionTelemetry(
            createMockTelemetry(`exam-${i}`, q)
          );
        }
      }

      await storage.clearAllQuestionTelemetry();

      const telemetry1 = await storage.getTelemetryByExam("exam-1");
      const telemetry2 = await storage.getTelemetryByExam("exam-2");
      expect(telemetry1).toHaveLength(0);
      expect(telemetry2).toHaveLength(0);
    });

    it("preserves exams during global reset", async () => {
      const exam = createMockExam("exam-1");
      await storage.saveExam(exam);
      await storage.saveQuestionTelemetry(createMockTelemetry("exam-1", 1));

      await storage.clearAllQuestionTelemetry();

      const result = await storage.getExam("exam-1");
      expect(result).toBeDefined();
      expect(result!.id).toBe("exam-1");
    });

    it("preserves attempts during global reset", async () => {
      const exam = createMockExam("exam-1");
      await storage.saveExam(exam);

      const attempt = createMockAttempt("att-1", "simulacro", ["exam-1"]);
      await storage.saveAttempt(attempt);
      await storage.saveQuestionTelemetry(createMockTelemetry("exam-1", 1));

      await storage.clearAllQuestionTelemetry();

      const result = await storage.getAttempt("att-1");
      expect(result).toBeDefined();
      expect(result!.id).toBe("att-1");
    });

    it("allows telemetry to be rebuilt after reset", async () => {
      const exam = createMockExam("exam-1");
      await storage.saveExam(exam);

      // Add initial telemetry
      await storage.saveQuestionTelemetry(createMockTelemetry("exam-1", 1));

      // Clear
      await storage.clearAllQuestionTelemetry();
      expect(await storage.getTelemetryByExam("exam-1")).toHaveLength(0);

      // Re-add
      await storage.saveQuestionTelemetry({
        ...createMockTelemetry("exam-1", 1),
        timesCorrect: 1,
        totalSeen: 1,
      });

      const result = await storage.getQuestionTelemetry("exam-1", 1);
      expect(result).toBeDefined();
      expect(result!.timesCorrect).toBe(1);
    });
  });

  describe("Data Consistency After Cascade", () => {
    it("maintains referential integrity after cascade delete", async () => {
      // Create exam with telemetry and attempts
      const exam = createMockExam("exam-1");
      await storage.saveExam(exam);

      for (let i = 1; i <= 5; i++) {
        await storage.saveQuestionTelemetry(createMockTelemetry("exam-1", i));
      }

      await storage.saveAttempt(createMockAttempt("att-1", "free", ["exam-1"]));
      await storage.saveAttempt(
        createMockAttempt("att-2", "simulacro", ["exam-1"])
      );
      await storage.saveAttempt(
        createMockAttempt("att-3", "review", ["exam-1"])
      );

      // Delete exam
      await storage.deleteExam("exam-1");

      // Verify no orphaned data
      const exams = await storage.getExams();
      const attempts = await storage.getAllAttempts();
      const telemetry = await storage.getTelemetryByExam("exam-1");

      expect(exams).toHaveLength(0);
      expect(attempts).toHaveLength(0);
      expect(telemetry).toHaveLength(0);
    });

    it("handles multiple exams with shared attempts correctly", async () => {
      // Create exams
      const exam1 = createMockExam("exam-1");
      const exam2 = createMockExam("exam-2");
      await storage.saveExam(exam1);
      await storage.saveExam(exam2);

      // Create attempts referencing different combinations
      const attempt1 = createMockAttempt("att-1", "simulacro", ["exam-1"]); // Only exam-1
      const attempt2 = createMockAttempt("att-2", "simulacro", ["exam-2"]); // Only exam-2
      const attempt3 = createMockAttempt("att-3", "simulacro", ["exam-1", "exam-2"]); // Both

      await storage.saveAttempt(attempt1);
      await storage.saveAttempt(attempt2);
      await storage.saveAttempt(attempt3);

      // Delete exam-1
      await storage.deleteExam("exam-1");

      // Verify: att-1 and att-3 deleted, att-2 preserved
      expect(await storage.getAttempt("att-1")).toBeUndefined();
      expect(await storage.getAttempt("att-2")).toBeDefined();
      expect(await storage.getAttempt("att-3")).toBeUndefined();
    });

    it("preserves unrelated data during partial deletion", async () => {
      // Create diverse data
      const exam1 = createMockExam("exam-1");
      const exam2 = createMockExam("exam-2");
      await storage.saveExam(exam1);
      await storage.saveExam(exam2);

      // Add telemetry for both
      for (let i = 1; i <= 3; i++) {
        await storage.saveQuestionTelemetry(createMockTelemetry("exam-1", i));
        await storage.saveQuestionTelemetry(createMockTelemetry("exam-2", i));
      }

      // Add attempts for both
      await storage.saveAttempt(createMockAttempt("att-1", "simulacro", ["exam-1"]));
      await storage.saveAttempt(createMockAttempt("att-2", "review", ["exam-2"]));

      // Delete only exam-1
      await storage.deleteExam("exam-1");

      // Verify exam-2 data is completely intact
      const exam2Data = await storage.getExam("exam-2");
      expect(exam2Data).toBeDefined();

      const exam2Telemetry = await storage.getTelemetryByExam("exam-2");
      expect(exam2Telemetry).toHaveLength(3);

      const exam2Attempt = await storage.getAttempt("att-2");
      expect(exam2Attempt).toBeDefined();
    });
  });
});
