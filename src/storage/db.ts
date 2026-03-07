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

const DB_NAME = "ginax_db";
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

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
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
   * Create a new transaction
   */
  private async transaction(
    storeNames: string | string[],
    mode: IDBTransactionMode,
  ): Promise<IDBTransaction> {
    const db = await this.ready();
    return db.transaction(storeNames, mode);
  }

  // ============================================================================
  // Exam Operations
  // ============================================================================

  /**
   * Save or update an exam
   */
  async saveExam(exam: StoredExam): Promise<string> {
    await this.ready();

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
      this.transaction([STORES.EXAMS], "readwrite")
        .then((tx) => {
          const store = tx.objectStore(STORES.EXAMS);
          const request = store.put(exam);

          request.onsuccess = () => resolve(exam.id);
          request.onerror = () => reject(request.error);
        })
        .catch(reject);
    });
  }

  /**
   * Get all exams
   */
  async getExams(): Promise<StoredExam[]> {
    await this.ready();

    return new Promise((resolve, reject) => {
      this.transaction([STORES.EXAMS], "readonly")
        .then((tx) => {
          const store = tx.objectStore(STORES.EXAMS);
          const request = store.getAll();

          request.onsuccess = () => resolve(request.result as StoredExam[]);
          request.onerror = () => reject(request.error);
        })
        .catch(reject);
    });
  }

  /**
   * Get a single exam by ID
   */
  async getExam(id: string): Promise<StoredExam | undefined> {
    await this.ready();

    return new Promise((resolve, reject) => {
      this.transaction([STORES.EXAMS], "readonly")
        .then((tx) => {
          const store = tx.objectStore(STORES.EXAMS);
          const request = store.get(id);

          request.onsuccess = () =>
            resolve(request.result as StoredExam | undefined);
          request.onerror = () => reject(request.error);
        })
        .catch(reject);
    });
  }

  /**
   * Delete an exam and its associated telemetry and attempts
   * Phase 7: Cascade deletion for telemetry and attempts (progress removed)
   */
  async deleteExam(id: string): Promise<void> {
    await this.ready();

    return new Promise((resolve, reject) => {
      this.transaction(
        [STORES.EXAMS, STORES.QUESTION_TELEMETRY, STORES.ATTEMPTS],
        "readwrite",
      )
        .then((tx) => {
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
          tx.onerror = (e) => {
            const target = e.target as IDBTransaction;
            reject(target.error);
          };
        })
        .catch(reject);
    });
  }

  // ============================================================================
  // Folder Operations
  // ============================================================================

  /**
   * Save or update a folder
   */
  async saveFolder(folder: Folder): Promise<string> {
    await this.ready();

    if (!folder.id) {
      folder.id = crypto.randomUUID();
    }

    return new Promise((resolve, reject) => {
      this.transaction([STORES.FOLDERS], "readwrite")
        .then((tx) => {
          const request = tx.objectStore(STORES.FOLDERS).put(folder);

          request.onsuccess = () => resolve(folder.id);
          request.onerror = () => reject(request.error);
        })
        .catch(reject);
    });
  }

  /**
   * Get all folders
   */
  async getFolders(): Promise<Folder[]> {
    await this.ready();

    return new Promise((resolve, reject) => {
      this.transaction([STORES.FOLDERS], "readonly")
        .then((tx) => {
          const request = tx.objectStore(STORES.FOLDERS).getAll();

          request.onsuccess = () => resolve(request.result as Folder[]);
          request.onerror = () => reject(request.error);
        })
        .catch(reject);
    });
  }

  /**
   * Delete a folder and move its exams to uncategorized
   */
  async deleteFolder(id: string): Promise<void> {
    await this.ready();

    // Get exams in this folder first
    const allExams = await this.getExams();
    const examsInFolder = allExams.filter((e) => e.folderId === id);

    return new Promise((resolve, reject) => {
      this.transaction([STORES.EXAMS, STORES.FOLDERS], "readwrite")
        .then((tx) => {
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
          tx.onerror = (e) => {
            const target = e.target as IDBTransaction;
            reject(target.error);
          };
        })
        .catch(reject);
    });
  }

  // ============================================================================
  // Attempt Operations
  // ============================================================================

  /**
   * Save an attempt
   */
  async saveAttempt(attempt: Attempt): Promise<string> {
    await this.ready();

    return new Promise((resolve, reject) => {
      this.transaction([STORES.ATTEMPTS], "readwrite")
        .then((tx) => {
          const store = tx.objectStore(STORES.ATTEMPTS);
          const request = store.put(attempt);

          request.onsuccess = () => resolve(attempt.id);
          request.onerror = () => reject(request.error);
        })
        .catch(reject);
    });
  }

  /**
   * Get an attempt by ID
   */
  async getAttempt(id: string): Promise<Attempt | undefined> {
    await this.ready();

    return new Promise((resolve, reject) => {
      this.transaction([STORES.ATTEMPTS], "readonly")
        .then((tx) => {
          const store = tx.objectStore(STORES.ATTEMPTS);
          const request = store.get(id);

          request.onsuccess = () =>
            resolve(request.result as Attempt | undefined);
          request.onerror = () => reject(request.error);
        })
        .catch(reject);
    });
  }

  /**
   * Get all attempts
   */
  async getAllAttempts(): Promise<Attempt[]> {
    await this.ready();

    return new Promise((resolve, reject) => {
      this.transaction([STORES.ATTEMPTS], "readonly")
        .then((tx) => {
          const store = tx.objectStore(STORES.ATTEMPTS);
          const request = store.getAll();

          request.onsuccess = () => resolve(request.result as Attempt[]);
          request.onerror = () => reject(request.error);
        })
        .catch(reject);
    });
  }

  /**
   * Get attempts by type
   */
  async getAttemptsByType(type: Attempt["type"]): Promise<Attempt[]> {
    await this.ready();

    return new Promise((resolve, reject) => {
      this.transaction([STORES.ATTEMPTS], "readonly")
        .then((tx) => {
          const store = tx.objectStore(STORES.ATTEMPTS);
          const index = store.index("type");
          const request = index.getAll(type);

          request.onsuccess = () => resolve(request.result as Attempt[]);
          request.onerror = () => reject(request.error);
        })
        .catch(reject);
    });
  }

  /**
   * Delete an attempt
   */
  async deleteAttempt(id: string): Promise<void> {
    await this.ready();

    return new Promise((resolve, reject) => {
      this.transaction([STORES.ATTEMPTS], "readwrite")
        .then((tx) => {
          const store = tx.objectStore(STORES.ATTEMPTS);
          const request = store.delete(id);

          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        })
        .catch(reject);
    });
  }

  /**
   * Delete attempts that reference a specific exam (cascade helper)
   */
  async deleteAttemptsForExam(examId: string): Promise<void> {
    await this.ready();

    return new Promise((resolve, reject) => {
      this.transaction([STORES.ATTEMPTS], "readwrite")
        .then((tx) => {
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
          tx.onerror = (e) => {
            const target = e.target as IDBTransaction;
            reject(target.error);
          };
        })
        .catch(reject);
    });
  }

  // ============================================================================
  // Question Telemetry Operations (M2)
  // ============================================================================

  /**
   * Save or update question telemetry
   */
  async saveQuestionTelemetry(telemetry: QuestionTelemetry): Promise<void> {
    await this.ready();

    return new Promise((resolve, reject) => {
      this.transaction([STORES.QUESTION_TELEMETRY], "readwrite")
        .then((tx) => {
          const store = tx.objectStore(STORES.QUESTION_TELEMETRY);
          const request = store.put(telemetry);

          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        })
        .catch(reject);
    });
  }

  /**
   * Get telemetry for a specific question
   */
  async getQuestionTelemetry(
    examId: string,
    questionNumber: number,
  ): Promise<QuestionTelemetry | undefined> {
    await this.ready();

    const id = `${examId}::${questionNumber}`;

    return new Promise((resolve, reject) => {
      this.transaction([STORES.QUESTION_TELEMETRY], "readonly")
        .then((tx) => {
          const store = tx.objectStore(STORES.QUESTION_TELEMETRY);
          const request = store.get(id);

          request.onsuccess = () =>
            resolve(request.result as QuestionTelemetry | undefined);
          request.onerror = () => reject(request.error);
        })
        .catch(reject);
    });
  }

  /**
   * Get all telemetry for an exam
   */
  async getTelemetryByExam(examId: string): Promise<QuestionTelemetry[]> {
    await this.ready();

    return new Promise((resolve, reject) => {
      this.transaction([STORES.QUESTION_TELEMETRY], "readonly")
        .then((tx) => {
          const store = tx.objectStore(STORES.QUESTION_TELEMETRY);
          const index = store.index("examId");
          const request = index.getAll(examId);

          request.onsuccess = () =>
            resolve(request.result as QuestionTelemetry[]);
          request.onerror = () => reject(request.error);
        })
        .catch(reject);
    });
  }

  /**
   * Get all question telemetry
   */
  async getAllQuestionTelemetry(): Promise<QuestionTelemetry[]> {
    await this.ready();

    return new Promise((resolve, reject) => {
      this.transaction([STORES.QUESTION_TELEMETRY], "readonly")
        .then((tx) => {
          const store = tx.objectStore(STORES.QUESTION_TELEMETRY);
          const request = store.getAll();

          request.onsuccess = () =>
            resolve(request.result as QuestionTelemetry[]);
          request.onerror = () => reject(request.error);
        })
        .catch(reject);
    });
  }

  /**
   * Delete telemetry for a specific question
   */
  async deleteQuestionTelemetry(
    examId: string,
    questionNumber: number,
  ): Promise<void> {
    await this.ready();

    const id = `${examId}::${questionNumber}`;

    return new Promise((resolve, reject) => {
      this.transaction([STORES.QUESTION_TELEMETRY], "readwrite")
        .then((tx) => {
          const store = tx.objectStore(STORES.QUESTION_TELEMETRY);
          const request = store.delete(id);

          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        })
        .catch(reject);
    });
  }

  /**
   * Delete all telemetry for an exam
   */
  async deleteTelemetryForExam(examId: string): Promise<void> {
    await this.ready();

    return new Promise((resolve, reject) => {
      this.transaction([STORES.QUESTION_TELEMETRY], "readwrite")
        .then((tx) => {
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
          tx.onerror = (e) => {
            const target = e.target as IDBTransaction;
            reject(target.error);
          };
        })
        .catch(reject);
    });
  }

  /**
   * Clear all question telemetry (global reset)
   * M2: Global reset clears ONLY telemetry, not exams or attempts
   */
  async clearAllQuestionTelemetry(): Promise<void> {
    await this.ready();

    return new Promise((resolve, reject) => {
      this.transaction([STORES.QUESTION_TELEMETRY], "readwrite")
        .then((tx) => {
          const store = tx.objectStore(STORES.QUESTION_TELEMETRY);
          const request = store.clear();

          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        })
        .catch(reject);
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
    await this.ready();

    return new Promise((resolve, reject) => {
      this.transaction([STORES.SETTINGS], "readonly")
        .then((tx) => {
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
        })
        .catch(() => {
          // If the store doesn't exist yet, return defaults
          resolve({ ...ExamStorage.DEFAULT_SETTINGS });
        });
    });
  }

  /**
   * Save a single setting key-value pair.
   */
  async saveSetting<K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ): Promise<void> {
    await this.ready();

    return new Promise((resolve, reject) => {
      this.transaction([STORES.SETTINGS], "readwrite")
        .then((tx) => {
          const store = tx.objectStore(STORES.SETTINGS);
          const request = store.put({ key, value });

          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        })
        .catch(reject);
    });
  }

  /**
   * Save multiple settings at once.
   */
  async saveSettings(settings: Partial<AppSettings>): Promise<void> {
    await this.ready();

    return new Promise((resolve, reject) => {
      this.transaction([STORES.SETTINGS], "readwrite")
        .then((tx) => {
          const store = tx.objectStore(STORES.SETTINGS);
          for (const [key, value] of Object.entries(settings)) {
            store.put({ key, value });
          }

          tx.oncomplete = () => resolve();
          tx.onerror = (e) => {
            const target = e.target as IDBTransaction;
            reject(target.error);
          };
        })
        .catch(reject);
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

    await this.ready();

    return new Promise((resolve, reject) => {
      this.transaction(
        [
          STORES.EXAMS,
          STORES.FOLDERS,
          STORES.ATTEMPTS,
          STORES.QUESTION_TELEMETRY,
        ],
        "readwrite",
      )
        .then((tx) => {
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
          tx.onerror = (e) => {
            const target = e.target as IDBTransaction;
            reject(target.error);
          };
        })
        .catch(reject);
    });
  }

  /**
   * Clear all data (exams, folders, attempts, telemetry, and settings)
   */
  async clearAll(): Promise<void> {
    await this.ready();

    return new Promise((resolve, reject) => {
      this.transaction(
        [
          STORES.EXAMS,
          STORES.FOLDERS,
          STORES.ATTEMPTS,
          STORES.QUESTION_TELEMETRY,
          STORES.SETTINGS,
        ],
        "readwrite",
      )
        .then((tx) => {
          tx.objectStore(STORES.EXAMS).clear();
          tx.objectStore(STORES.FOLDERS).clear();
          tx.objectStore(STORES.ATTEMPTS).clear();
          tx.objectStore(STORES.QUESTION_TELEMETRY).clear();
          tx.objectStore(STORES.SETTINGS).clear();

          tx.oncomplete = () => resolve();
          tx.onerror = (e) => {
            const target = e.target as IDBTransaction;
            reject(target.error);
          };
        })
        .catch(reject);
    });
  }
}

// Singleton instance
export const storage = new ExamStorage();
