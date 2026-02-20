/**
 * Storage Service - IndexedDB wrapper for exam data persistence
 * 
 * This module provides a clean interface for storing and retrieving
 * exams, folders, and progress data using IndexedDB.
 */

import type { Exam, Folder, ExamProgress, ExportData } from "../domain/types.js";

const DB_NAME = "ginax_db";
const DB_VERSION = 1;

// Store names
const STORES = {
  EXAMS: "exams",
  FOLDERS: "folders",
  PROGRESS: "progress",
} as const;

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

        // Exams store: keyPath = id
        if (!db.objectStoreNames.contains(STORES.EXAMS)) {
          const examStore = db.createObjectStore(STORES.EXAMS, { keyPath: "id" });
          examStore.createIndex("folderId", "folderId", { unique: false });
          examStore.createIndex("addedAt", "addedAt", { unique: false });
        }

        // Folders store: keyPath = id
        if (!db.objectStoreNames.contains(STORES.FOLDERS)) {
          const folderStore = db.createObjectStore(STORES.FOLDERS, { keyPath: "id" });
          folderStore.createIndex("name", "name", { unique: false });
        }

        // Progress store: keyPath = examId
        if (!db.objectStoreNames.contains(STORES.PROGRESS)) {
          db.createObjectStore(STORES.PROGRESS, { keyPath: "examId" });
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
    mode: IDBTransactionMode
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
  async saveExam(exam: Exam): Promise<string> {
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
  async getExams(): Promise<Exam[]> {
    await this.ready();

    return new Promise((resolve, reject) => {
      this.transaction([STORES.EXAMS], "readonly")
        .then((tx) => {
          const store = tx.objectStore(STORES.EXAMS);
          const request = store.getAll();

          request.onsuccess = () => resolve(request.result as Exam[]);
          request.onerror = () => reject(request.error);
        })
        .catch(reject);
    });
  }

  /**
   * Get a single exam by ID
   */
  async getExam(id: string): Promise<Exam | undefined> {
    await this.ready();

    return new Promise((resolve, reject) => {
      this.transaction([STORES.EXAMS], "readonly")
        .then((tx) => {
          const store = tx.objectStore(STORES.EXAMS);
          const request = store.get(id);

          request.onsuccess = () => resolve(request.result as Exam | undefined);
          request.onerror = () => reject(request.error);
        })
        .catch(reject);
    });
  }

  /**
   * Delete an exam and its associated progress
   */
  async deleteExam(id: string): Promise<void> {
    await this.ready();

    return new Promise((resolve, reject) => {
      this.transaction([STORES.EXAMS, STORES.PROGRESS], "readwrite")
        .then((tx) => {
          // Delete exam
          tx.objectStore(STORES.EXAMS).delete(id);
          // Delete associated progress
          tx.objectStore(STORES.PROGRESS).delete(id);

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
  // Progress Operations
  // ============================================================================

  /**
   * Save progress for an exam
   */
  async saveProgress(progress: ExamProgress): Promise<void> {
    await this.ready();

    return new Promise((resolve, reject) => {
      this.transaction([STORES.PROGRESS], "readwrite")
        .then((tx) => {
          const request = tx.objectStore(STORES.PROGRESS).put(progress);

          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        })
        .catch(reject);
    });
  }

  /**
   * Get progress for a specific exam
   */
  async getProgress(examId: string): Promise<ExamProgress | undefined> {
    await this.ready();

    return new Promise((resolve, reject) => {
      this.transaction([STORES.PROGRESS], "readonly")
        .then((tx) => {
          const request = tx.objectStore(STORES.PROGRESS).get(examId);

          request.onsuccess = () => resolve(request.result as ExamProgress | undefined);
          request.onerror = () => reject(request.error);
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
    const [exams, folders, progress] = await Promise.all([
      this.getExams(),
      this.getFolders(),
      new Promise<ExamProgress[]>((resolve, reject) => {
        this.transaction([STORES.PROGRESS], "readonly")
          .then((tx) => {
            const request = tx.objectStore(STORES.PROGRESS).getAll();
            request.onsuccess = () => resolve(request.result as ExamProgress[]);
            request.onerror = () => reject(request.error);
          })
          .catch(reject);
      }),
    ]);

    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      exams,
      folders,
      progress,
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
      this.transaction([STORES.EXAMS, STORES.FOLDERS, STORES.PROGRESS], "readwrite")
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

          if (data.progress) {
            data.progress.forEach((item) => {
              tx.objectStore(STORES.PROGRESS).put(item);
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
   * Clear all data
   */
  async clearAll(): Promise<void> {
    await this.ready();

    return new Promise((resolve, reject) => {
      this.transaction([STORES.EXAMS, STORES.FOLDERS, STORES.PROGRESS], "readwrite")
        .then((tx) => {
          tx.objectStore(STORES.EXAMS).clear();
          tx.objectStore(STORES.FOLDERS).clear();
          tx.objectStore(STORES.PROGRESS).clear();

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
