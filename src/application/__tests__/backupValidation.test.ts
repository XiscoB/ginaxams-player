/**
 * Backup Validation Tests
 */

import { describe, it, expect } from "vitest";
import {
  validateBackupSnapshot,
  isValidBackupSnapshot,
} from "../backupValidation.js";
import { SNAPSHOT_VERSION } from "../viewState.js";

/**
 * Minimal valid backup snapshot for testing.
 */
function makeValidSnapshot() {
  return {
    snapshot_version: SNAPSHOT_VERSION,
    db_version: 4,
    created_at: "2024-01-01T00:00:00.000Z",
    data: {
      exams: [],
      folders: [],
      attempts: [],
      questionTelemetry: [],
    },
  };
}

describe("validateBackupSnapshot", () => {
  it("accepts a valid empty snapshot", () => {
    const result = validateBackupSnapshot(makeValidSnapshot());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("accepts a snapshot with data arrays containing objects", () => {
    const snapshot = makeValidSnapshot();
    snapshot.data.exams = [{ id: "e1" } as never];
    snapshot.data.folders = [{ id: "f1" } as never];
    snapshot.data.attempts = [{ id: "a1" } as never];
    snapshot.data.questionTelemetry = [{ id: "t1" } as never];

    const result = validateBackupSnapshot(snapshot);
    expect(result.valid).toBe(true);
  });

  // ---------- null / non-object ----------

  it("rejects null", () => {
    const result = validateBackupSnapshot(null);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Backup data must be a non-null object");
  });

  it("rejects a string", () => {
    const result = validateBackupSnapshot("hello");
    expect(result.valid).toBe(false);
  });

  it("rejects undefined", () => {
    const result = validateBackupSnapshot(undefined);
    expect(result.valid).toBe(false);
  });

  // ---------- snapshot_version ----------

  it("rejects missing snapshot_version", () => {
    const snapshot = makeValidSnapshot();
    delete (snapshot as Record<string, unknown>).snapshot_version;

    const result = validateBackupSnapshot(snapshot);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("snapshot_version"))).toBe(
      true,
    );
  });

  it("rejects wrong snapshot_version", () => {
    const snapshot = { ...makeValidSnapshot(), snapshot_version: 99 };
    const result = validateBackupSnapshot(snapshot);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes("Unsupported snapshot_version")),
    ).toBe(true);
  });

  // ---------- db_version ----------

  it("rejects missing db_version", () => {
    const snapshot = makeValidSnapshot();
    delete (snapshot as Record<string, unknown>).db_version;

    const result = validateBackupSnapshot(snapshot);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("db_version"))).toBe(true);
  });

  it("rejects db_version = 0", () => {
    const snapshot = { ...makeValidSnapshot(), db_version: 0 };
    const result = validateBackupSnapshot(snapshot);
    expect(result.valid).toBe(false);
  });

  it("rejects negative db_version", () => {
    const snapshot = { ...makeValidSnapshot(), db_version: -1 };
    const result = validateBackupSnapshot(snapshot);
    expect(result.valid).toBe(false);
  });

  // ---------- created_at ----------

  it("rejects missing created_at", () => {
    const snapshot = makeValidSnapshot();
    delete (snapshot as Record<string, unknown>).created_at;

    const result = validateBackupSnapshot(snapshot);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("created_at"))).toBe(true);
  });

  it("rejects empty created_at string", () => {
    const snapshot = { ...makeValidSnapshot(), created_at: "" };
    const result = validateBackupSnapshot(snapshot);
    expect(result.valid).toBe(false);
  });

  // ---------- data ----------

  it("rejects missing data", () => {
    const snapshot = makeValidSnapshot();
    delete (snapshot as Record<string, unknown>).data;

    const result = validateBackupSnapshot(snapshot);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("'data'"))).toBe(true);
  });

  it("rejects data = null", () => {
    const snapshot = { ...makeValidSnapshot(), data: null };
    const result = validateBackupSnapshot(snapshot);
    expect(result.valid).toBe(false);
  });

  // ---------- data arrays ----------

  it("rejects missing data.exams", () => {
    const snapshot = makeValidSnapshot();
    delete (snapshot.data as Record<string, unknown>).exams;

    const result = validateBackupSnapshot(snapshot);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("data.exams"))).toBe(true);
  });

  it("rejects missing data.folders", () => {
    const snapshot = makeValidSnapshot();
    delete (snapshot.data as Record<string, unknown>).folders;

    const result = validateBackupSnapshot(snapshot);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("data.folders"))).toBe(true);
  });

  it("rejects missing data.attempts", () => {
    const snapshot = makeValidSnapshot();
    delete (snapshot.data as Record<string, unknown>).attempts;

    const result = validateBackupSnapshot(snapshot);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("data.attempts"))).toBe(true);
  });

  it("rejects missing data.questionTelemetry", () => {
    const snapshot = makeValidSnapshot();
    delete (snapshot.data as Record<string, unknown>).questionTelemetry;

    const result = validateBackupSnapshot(snapshot);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes("data.questionTelemetry")),
    ).toBe(true);
  });

  it("rejects non-array data.exams", () => {
    const snapshot = makeValidSnapshot();
    (snapshot.data as Record<string, unknown>).exams = "not-an-array";

    const result = validateBackupSnapshot(snapshot);
    expect(result.valid).toBe(false);
  });

  // ---------- multiple errors ----------

  it("reports multiple errors at once", () => {
    const result = validateBackupSnapshot({});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
  });

  it("reports all missing array errors", () => {
    const result = validateBackupSnapshot({
      snapshot_version: SNAPSHOT_VERSION,
      db_version: 4,
      created_at: "2024-01-01T00:00:00Z",
      data: {},
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(4); // exams, folders, attempts, questionTelemetry
  });
});

describe("isValidBackupSnapshot", () => {
  it("returns true for a valid snapshot", () => {
    expect(isValidBackupSnapshot(makeValidSnapshot())).toBe(true);
  });

  it("returns false for null", () => {
    expect(isValidBackupSnapshot(null)).toBe(false);
  });

  it("returns false for invalid data", () => {
    expect(isValidBackupSnapshot({ snapshot_version: 99 })).toBe(false);
  });
});
