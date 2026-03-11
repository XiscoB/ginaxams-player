/**
 * Storage Service - IndexedDB wrapper for exam data persistence
 *
 * This module provides a clean interface for storing and retrieving
 * exams, folders, attempts, and question telemetry using IndexedDB.
 */

import type {
  StoredExam,
  Folder,
  ExportData,
  Attempt,
  QuestionTelemetry,
} from "../domain/types.js";

const DB_NAME = "ginaxams_v2_db";
/** Current IndexedDB schema version */
export const DB_VERSION = 5; // Phase 16: Added settings store

// Store names
const STORES = {
  EXAMS: "exams",
  FOLDERS: "folders",
  ATTEMPTS: "attempts",
  QUESTION_TELEMETRY: "questionTelemetry",
  SETTINGS: "settings",
} as const;

/**
 * Application settings persisted in IndexedDB.
 * UI preferences only — no domain state.
 */
export interface AppSettings {
  /** Which tab was last open: library, insights, or telemetry */
  lastOpenedTab: "library" | "insights" | "telemetry";
  /** User's preferred language */
  language: "en" | "es";
}

/**
 * IndexedDB Storage Manager
 */
export class ExamStorage {
  private db: IDBDatabase | null = null;
  private readyPromise: Promise<IDBDatabase>;

  constructor() {
    this.readyPromise = this.init();
  }

  /**
   * Initialize the database connection
   */
  private async init(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = (event) => {
        const error = (event.target as IDBOpenDBRequest).error;
        console.error("IndexedDB error:", error);
        reject(error);
      };

      request.onblocked = () => {
        console.error("IndexedDB blocked: close other tabs using this app");
        reject(new Error("IndexedDB blocked: close other tabs and retry"));
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        // Auto-close when another connection requests a version change
        // (e.g. deleteDatabase). This prevents blocking.
        this.db.onversionchange = () => {
          this.db?.close();
          this.db = null;
        };
        console.log("IndexedDB ready");
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const oldVersion = event.oldVersion;

        // Phase 7: v3 to v4 migration - remove legacy progress store
        if (oldVersion < 4) {
          // Delete legacy progress store if it exists
          if (db.objectStoreNames.contains("progress")) {
            db.deleteObjectStore("progress");
          }
        }

        // v1/v2 to v4 migration: create core stores
        if (oldVersion < 2) {
          // Create Exams store: keyPath = id
          if (!db.objectStoreNames.contains(STORES.EXAMS)) {
            const examStore = db.createObjectStore(STORES.EXAMS, {
              keyPath: "id",
            });
            examStore.createIndex("folderId", "folderId", { unique: false });
            examStore.createIndex("addedAt", "addedAt", { unique: false });
          }

          // Create Folders store: keyPath = id
          if (!db.objectStoreNames.contains(STORES.FOLDERS)) {
            const folderStore = db.createObjectStore(STORES.FOLDERS, {
              keyPath: "id",
            });
            folderStore.createIndex("name", "name", { unique: false });
          }
        }

        // v2/v3 to v4 migration: create Attempts and Telemetry stores
        if (oldVersion < 4) {
          // Create Attempts store: keyPath = id
          if (!db.objectStoreNames.contains(STORES.ATTEMPTS)) {
            const attemptsStore = db.createObjectStore(STORES.ATTEMPTS, {
              keyPath: "id",
            });
            attemptsStore.createIndex("type", "type", { unique: false });
            attemptsStore.createIndex("createdAt", "createdAt", {
              unique: false,
            });
          }

          // Create QuestionTelemetry store: keyPath = id
          if (!db.objectStoreNames.contains(STORES.QUESTION_TELEMETRY)) {
            const telemetryStore = db.createObjectStore(
              STORES.QUESTION_TELEMETRY,
              {
                keyPath: "id",
              },
            );
            telemetryStore.createIndex("examId_questionNumber", [
              "examId",
              "questionNumber",
            ]);
            telemetryStore.createIndex("examId", "examId", { unique: false });
            telemetryStore.createIndex("lastSeenAt", "lastSeenAt", {
              unique: false,
            });
          }
        }

        // Phase 16: v4 to v5 migration — add settings store
        if (oldVersion < 5) {
          if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
            db.createObjectStore(STORES.SETTINGS, { keyPath: "key" });
          }
        }
      };
    });
  }

  /**
   * Wait for the database to be ready
   */
  async ready(): Promise<IDBDatabase> {
    return this.readyPromise;
  }

  /**
   * Close the database connection (if open).
   * Used before deleteDatabase to unblock the delete request.
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  // ============================================================================
  // Exam Operations
  // ============================================================================

  /**
   * Save or update an exam
   */
  async saveExam(exam: StoredExam): Promise<string> {
    const db = await this.ready();

    // Ensure exam has an ID and timestamp
    if (!exam.id) {
      exam.id = crypto.randomUUID();
    }
    if (!exam.addedAt) {
      exam.addedAt = new Date().toISOString();
    }
    if (!exam.folderId) {
      exam.folderId = "uncategorized";
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.EXAMS], "readwrite");
      const store = tx.objectStore(STORES.EXAMS);
      const request = store.put(exam);

      request.onsuccess = () => resolve(exam.id);
      request.onerror = () => reject(request.error);
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Get all exams
   */
  async getExams(): Promise<StoredExam[]> {
    const db = await this.ready();

    return new Promise((resolve, reject) => {
      // Create transaction and request immediately to avoid Firefox auto-commit
      const tx = db.transaction([STORES.EXAMS], "readonly");
      const store = tx.objectStore(STORES.EXAMS);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result as StoredExam[]);
      request.onerror = () => reject(request.error);
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Get a single exam by ID
   */
  async getExam(id: string): Promise<StoredExam | undefined> {
    const db = await this.ready();

    return new Promise((resolve, reject) => {
      // Create transaction and request immediately to avoid Firefox auto-commit
      const tx = db.transaction([STORES.EXAMS], "readonly");
      const store = tx.objectStore(STORES.EXAMS);
      const request = store.get(id);

      request.onsuccess = () =>
        resolve(request.result as StoredExam | undefined);
      request.onerror = () => reject(request.error);
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Delete an exam and its associated telemetry and attempts
   * Phase 7: Cascade deletion for telemetry and attempts (progress removed)
   */
  async deleteExam(id: string): Promise<void> {
    const db = await this.ready();

    return new Promise((resolve, reject) => {
      // Create transaction immediately to avoid Firefox auto-commit
      const tx = db.transaction(
        [STORES.EXAMS, STORES.QUESTION_TELEMETRY, STORES.ATTEMPTS],
        "readwrite",
      );

      // Delete exam
      tx.objectStore(STORES.EXAMS).delete(id);

      // Delete telemetry for this exam
      const telemetryStore = tx.objectStore(STORES.QUESTION_TELEMETRY);
      const telemetryIndex = telemetryStore.index("examId");
      const telemetryRequest = telemetryIndex.getAllKeys(id);
      telemetryRequest.onsuccess = () => {
        const keys = telemetryRequest.result as string[];
        for (const key of keys) {
          telemetryStore.delete(key);
        }
      };

      // M2: Delete attempts that reference this exam
      const attemptsStore = tx.objectStore(STORES.ATTEMPTS);
      const allAttemptsRequest = attemptsStore.getAll();
      allAttemptsRequest.onsuccess = () => {
        const attempts = allAttemptsRequest.result as Attempt[];
        for (const attempt of attempts) {
          if (attempt.sourceExamIds.includes(id)) {
            attemptsStore.delete(attempt.id);
          }
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ============================================================================
  // Folder Operations
  // ============================================================================

  /**
   * Save or update a folder
   */
  async saveFolder(folder: Folder): Promise<string> {
    const db = await this.ready();

    if (!folder.id) {
      folder.id = crypto.randomUUID();
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.FOLDERS], "readwrite");
      const request = tx.objectStore(STORES.FOLDERS).put(folder);

      request.onsuccess = () => resolve(folder.id);
      request.onerror = () => reject(request.error);
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Get all folders
   */
  async getFolders(): Promise<Folder[]> {
    const db = await this.ready();

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.FOLDERS], "readonly");
      const request = tx.objectStore(STORES.FOLDERS).getAll();

      request.onsuccess = () => resolve(request.result as Folder[]);
      request.onerror = () => reject(request.error);
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Delete a folder and move its exams to uncategorized
   */
  async deleteFolder(id: string): Promise<void> {
    const db = await this.ready();

    // Get exams in this folder first
    const allExams = await this.getExams();
    const examsInFolder = allExams.filter((e) => e.folderId === id);

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.EXAMS, STORES.FOLDERS], "readwrite");

      // Move exams to uncategorized
      if (examsInFolder.length > 0) {
        const examStore = tx.objectStore(STORES.EXAMS);
        examsInFolder.forEach((exam) => {
          exam.folderId = "uncategorized";
          examStore.put(exam);
        });
      }

      // Delete folder
      tx.objectStore(STORES.FOLDERS).delete(id);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ============================================================================
  // Attempt Operations
  // ============================================================================

  /**
   * Save an attempt
   */
  async saveAttempt(attempt: Attempt): Promise<string> {
    const db = await this.ready();

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.ATTEMPTS], "readwrite");
      const store = tx.objectStore(STORES.ATTEMPTS);
      const request = store.put(attempt);

      request.onsuccess = () => resolve(attempt.id);
      request.onerror = () => reject(request.error);
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Get an attempt by ID
   */
  async getAttempt(id: string): Promise<Attempt | undefined> {
    const db = await this.ready();

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.ATTEMPTS], "readonly");
      const store = tx.objectStore(STORES.ATTEMPTS);
      const request = store.get(id);

      request.onsuccess = () =>
        resolve(request.result as Attempt | undefined);
      request.onerror = () => reject(request.error);
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Get all attempts
   */
  async getAllAttempts(): Promise<Attempt[]> {
    const db = await this.ready();

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.ATTEMPTS], "readonly");
      const store = tx.objectStore(STORES.ATTEMPTS);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result as Attempt[]);
      request.onerror = () => reject(request.error);
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Get attempts by type
   */
  async getAttemptsByType(type: Attempt["type"]): Promise<Attempt[]> {
    const db = await this.ready();

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.ATTEMPTS], "readonly");
      const store = tx.objectStore(STORES.ATTEMPTS);
      const index = store.index("type");
      const request = index.getAll(type);

      request.onsuccess = () => resolve(request.result as Attempt[]);
      request.onerror = () => reject(request.error);
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Delete an attempt
   */
  async deleteAttempt(id: string): Promise<void> {
    const db = await this.ready();

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.ATTEMPTS], "readwrite");
      const store = tx.objectStore(STORES.ATTEMPTS);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Delete attempts that reference a specific exam (cascade helper)
   */
  async deleteAttemptsForExam(examId: string): Promise<void> {
    const db = await this.ready();

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.ATTEMPTS], "readwrite");
      const store = tx.objectStore(STORES.ATTEMPTS);
      const request = store.getAll();

      request.onsuccess = () => {
        const attempts = request.result as Attempt[];
        for (const attempt of attempts) {
          if (attempt.sourceExamIds.includes(examId)) {
            store.delete(attempt.id);
          }
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ============================================================================
  // Question Telemetry Operations (M2)
  // ============================================================================

  /**
   * Save or update question telemetry
   */
  async saveQuestionTelemetry(telemetry: QuestionTelemetry): Promise<void> {
    const db = await this.ready();

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.QUESTION_TELEMETRY], "readwrite");
      const store = tx.objectStore(STORES.QUESTION_TELEMETRY);
      const request = store.put(telemetry);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Get telemetry for a specific question
   */
  async getQuestionTelemetry(
    examId: string,
    questionNumber: number,
  ): Promise<QuestionTelemetry | undefined> {
    const db = await this.ready();

    const id = `${examId}::${questionNumber}`;

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.QUESTION_TELEMETRY], "readonly");
      const store = tx.objectStore(STORES.QUESTION_TELEMETRY);
      const request = store.get(id);

      request.onsuccess = () =>
        resolve(request.result as QuestionTelemetry | undefined);
      request.onerror = () => reject(request.error);
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Get all telemetry for an exam
   */
  async getTelemetryByExam(examId: string): Promise<QuestionTelemetry[]> {
    const db = await this.ready();

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.QUESTION_TELEMETRY], "readonly");
      const store = tx.objectStore(STORES.QUESTION_TELEMETRY);
      const index = store.index("examId");
      const request = index.getAll(examId);

      request.onsuccess = () =>
        resolve(request.result as QuestionTelemetry[]);
      request.onerror = () => reject(request.error);
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Get all question telemetry
   */
  async getAllQuestionTelemetry(): Promise<QuestionTelemetry[]> {
    const db = await this.ready();

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.QUESTION_TELEMETRY], "readonly");
      const store = tx.objectStore(STORES.QUESTION_TELEMETRY);
      const request = store.getAll();

      request.onsuccess = () =>
        resolve(request.result as QuestionTelemetry[]);
      request.onerror = () => reject(request.error);
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Delete telemetry for a specific question
   */
  async deleteQuestionTelemetry(
    examId: string,
    questionNumber: number,
  ): Promise<void> {
    const db = await this.ready();

    const id = `${examId}::${questionNumber}`;

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.QUESTION_TELEMETRY], "readwrite");
      const store = tx.objectStore(STORES.QUESTION_TELEMETRY);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Delete all telemetry for an exam
   */
  async deleteTelemetryForExam(examId: string): Promise<void> {
    const db = await this.ready();

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.QUESTION_TELEMETRY], "readwrite");
      const store = tx.objectStore(STORES.QUESTION_TELEMETRY);
      const index = store.index("examId");
      const request = index.getAllKeys(examId);

      request.onsuccess = () => {
        const keys = request.result as string[];
        for (const key of keys) {
          store.delete(key);
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Clear all question telemetry (global reset)
   * M2: Global reset clears ONLY telemetry, not exams or attempts
   */
  async clearAllQuestionTelemetry(): Promise<void> {
    const db = await this.ready();

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.QUESTION_TELEMETRY], "readwrite");
      const store = tx.objectStore(STORES.QUESTION_TELEMETRY);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      tx.onerror = () => reject(tx.error);
    });
  }

  // ============================================================================
  // Settings Operations (Phase 16)
  // ============================================================================

  /** Default settings used when no persisted settings exist */
  private static readonly DEFAULT_SETTINGS: AppSettings = {
    lastOpenedTab: "library",
    language: "en",
  };

  /**
   * Load all application settings.
   * Returns defaults merged with any persisted values.
   */
  async loadSettings(): Promise<AppSettings> {
    const db = await this.ready();

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.SETTINGS], "readonly");
      const store = tx.objectStore(STORES.SETTINGS);
      const request = store.getAll();

      request.onsuccess = () => {
        const rows = request.result as Array<{
          key: string;
          value: unknown;
        }>;
        const persisted: Record<string, unknown> = {};
        for (const row of rows) {
          persisted[row.key] = row.value;
        }
        resolve({
          ...ExamStorage.DEFAULT_SETTINGS,
          ...persisted,
        } as AppSettings);
      };
      request.onerror = () => reject(request.error);
      tx.onerror = () => {
        // If the store doesn't exist yet, return defaults
        resolve({ ...ExamStorage.DEFAULT_SETTINGS });
      };
    });
  }

  /**
   * Save a single setting key-value pair.
   */
  async saveSetting<K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ): Promise<void> {
    const db = await this.ready();

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.SETTINGS], "readwrite");
      const store = tx.objectStore(STORES.SETTINGS);
      const request = store.put({ key, value });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Save multiple settings at once.
   */
  async saveSettings(settings: Partial<AppSettings>): Promise<void> {
    const db = await this.ready();

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.SETTINGS], "readwrite");
      const store = tx.objectStore(STORES.SETTINGS);
      for (const [key, value] of Object.entries(settings)) {
        store.put({ key, value });
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ============================================================================
  // Import/Export
  // ============================================================================

  /**
   * Export all data
   */
  async exportData(): Promise<ExportData> {
    const [exams, folders, attempts, telemetry] = await Promise.all([
      this.getExams(),
      this.getFolders(),
      this.getAllAttempts(),
      this.getAllQuestionTelemetry(),
    ]);

    return {
      version: 3, // Phase 7: Removed legacy progress store
      exportedAt: new Date().toISOString(),
      exams,
      folders,
      attempts,
      telemetry,
    };
  }

  /**
   * Import data from an export file
   */
  async importData(data: ExportData): Promise<void> {
    if (!data.exams) {
      throw new Error("Invalid data format: missing 'exams'");
    }

    const db = await this.ready();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(
        [
          STORES.EXAMS,
          STORES.FOLDERS,
          STORES.ATTEMPTS,
          STORES.QUESTION_TELEMETRY,
        ],
        "readwrite",
      );

      // Merge data, overwriting if ID exists
      data.exams.forEach((item) => {
        tx.objectStore(STORES.EXAMS).put(item);
      });

      if (data.folders) {
        data.folders.forEach((item) => {
          tx.objectStore(STORES.FOLDERS).put(item);
        });
      }

      // Import attempts if present
      if (data.attempts) {
        data.attempts.forEach((item) => {
          tx.objectStore(STORES.ATTEMPTS).put(item);
        });
      }

      // Import telemetry if present
      if (data.telemetry) {
        data.telemetry.forEach((item) => {
          tx.objectStore(STORES.QUESTION_TELEMETRY).put(item);
        });
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Clear all data (exams, folders, attempts, telemetry, and settings)
   */
  async clearAll(): Promise<void> {
    const db = await this.ready();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(
        [
          STORES.EXAMS,
          STORES.FOLDERS,
          STORES.ATTEMPTS,
          STORES.QUESTION_TELEMETRY,
          STORES.SETTINGS,
        ],
        "readwrite",
      );

      tx.objectStore(STORES.EXAMS).clear();
      tx.objectStore(STORES.FOLDERS).clear();
      tx.objectStore(STORES.ATTEMPTS).clear();
      tx.objectStore(STORES.QUESTION_TELEMETRY).clear();
      tx.objectStore(STORES.SETTINGS).clear();

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

// Singleton instance
export const storage = new ExamStorage();

/**
 * Delete the entire IndexedDB database.
 * Use for recovery when the DB is corrupted or incompatible.
 * Sets a localStorage flag so any pending open on reload
 * can be cleanly handled.
 */
export function deleteDatabase(): Promise<void> {
  // Close any open connection first so deleteDatabase isn't blocked
  storage.close();

  // Flag so we can retry on a fresh page if this attempt gets blocked
  localStorage.setItem("ginaxams_pendingDelete", "1");

  return new Promise((resolve) => {
    // Safety timeout: if nothing fires in 2s, resolve anyway.
    // The page reload will drop all connections and the browser
    // will retry deletion on next load via the localStorage flag.
    const timeout = setTimeout(() => {
      console.warn("deleteDatabase timed out, proceeding with reload");
      resolve();
    }, 2000);

    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => {
      clearTimeout(timeout);
      localStorage.removeItem("ginaxams_pendingDelete");
      resolve();
    };
    request.onerror = () => {
      clearTimeout(timeout);
      console.warn("deleteDatabase error, proceeding with reload");
      resolve();
    };
    request.onblocked = () => {
      clearTimeout(timeout);
      console.warn("deleteDatabase blocked, proceeding with reload");
      resolve();
    };
  });
}

/**
 * If a previous deleteDatabase attempt was interrupted, retry it.
 * Call this BEFORE creating ExamStorage on page load.
 */
export function retryPendingDelete(): Promise<void> {
  if (!localStorage.getItem("ginaxams_pendingDelete")) {
    return Promise.resolve();
  }

  // Clear the flag immediately so we don't get stuck in a loop
  localStorage.removeItem("ginaxams_pendingDelete");

  return new Promise((resolve) => {
    // Safety timeout: if delete hangs, proceed anyway
    const timeout = setTimeout(() => {
      console.warn("retryPendingDelete timed out, proceeding");
      resolve();
    }, 1000);

    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => {
      clearTimeout(timeout);
      console.log("retryPendingDelete: database deleted");
      resolve();
    };
    request.onerror = () => {
      clearTimeout(timeout);
      console.warn("retryPendingDelete: delete failed, proceeding");
      resolve();
    };
    request.onblocked = () => {
      clearTimeout(timeout);
      console.warn("retryPendingDelete: delete blocked, proceeding");
      resolve();
    };
  });
}
