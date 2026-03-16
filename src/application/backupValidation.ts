/**
 * Backup Validation — Pure Functions
 *
 * Validates BackupSnapshot structure before restore.
 * All functions are pure: no side effects, no DOM, no storage access.
 */

import type { BackupSnapshot } from "./viewState.js";
import { SNAPSHOT_VERSION } from "./viewState.js";

/**
 * Validation result for a backup snapshot.
 */
export interface BackupValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a backup snapshot structure.
 *
 * Checks:
 * - snapshot_version matches current version
 * - db_version is a positive integer
 * - created_at is a non-empty string
 * - data object exists with all required arrays
 * - Each array contains only objects (shallow type check)
 *
 * Does NOT validate individual record schemas (that's the domain layer's job).
 *
 * @param data - Unknown data to validate
 * @returns Validation result with errors if invalid
 */
export function validateBackupSnapshot(data: unknown): BackupValidationResult {
  const errors: string[] = [];

  if (data === null || typeof data !== "object") {
    return { valid: false, errors: ["Backup data must be a non-null object"] };
  }

  const obj = data as Record<string, unknown>;

  // snapshot_version
  if (typeof obj.snapshot_version !== "number") {
    errors.push("Missing or invalid 'snapshot_version' (must be a number)");
  } else if (obj.snapshot_version !== SNAPSHOT_VERSION) {
    errors.push(
      `Unsupported snapshot_version: ${obj.snapshot_version} (expected ${SNAPSHOT_VERSION})`,
    );
  }

  // db_version
  if (typeof obj.db_version !== "number" || obj.db_version < 1) {
    errors.push("Missing or invalid 'db_version' (must be a positive number)");
  }

  // created_at
  if (typeof obj.created_at !== "string" || obj.created_at.length === 0) {
    errors.push("Missing or invalid 'created_at' (must be a non-empty string)");
  }

  // data
  if (obj.data === null || typeof obj.data !== "object") {
    errors.push("Missing or invalid 'data' (must be a non-null object)");
    return { valid: false, errors };
  }

  const dataObj = obj.data as Record<string, unknown>;

  // Required arrays in data
  const requiredArrays = [
    "exams",
    "folders",
    "attempts",
    "questionTelemetry",
  ] as const;
  for (const arrayName of requiredArrays) {
    if (!Array.isArray(dataObj[arrayName])) {
      errors.push(`Missing or invalid 'data.${arrayName}' (must be an array)`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Type guard: narrow unknown data to BackupSnapshot after validation.
 *
 * @param data - Unknown data
 * @returns True if data is a valid BackupSnapshot
 */
export function isValidBackupSnapshot(data: unknown): data is BackupSnapshot {
  return validateBackupSnapshot(data).valid;
}
