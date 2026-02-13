/**
 * Storage Service for Ginaxams using IndexedDB
 */
class ExamStorage {
  constructor() {
    this.dbName = 'ginax_db';
    this.dbVersion = 1;
    this.db = null;
    this.readyPromise = this.init();
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = (event) => {
        console.error("IndexedDB error:", event.target.error);
        reject(event.target.error);
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        console.log("IndexedDB ready");
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Exams store: keyPath = id
        if (!db.objectStoreNames.contains('exams')) {
          const examStore = db.createObjectStore('exams', { keyPath: 'id' });
          examStore.createIndex('folderId', 'folderId', { unique: false });
          examStore.createIndex('addedAt', 'addedAt', { unique: false });
        }

        // Folders store: keyPath = id
        if (!db.objectStoreNames.contains('folders')) {
          const folderStore = db.createObjectStore('folders', { keyPath: 'id' });
          folderStore.createIndex('name', 'name', { unique: false });
        }

        // Progress store: keyPath = examId
        if (!db.objectStoreNames.contains('progress')) {
          db.createObjectStore('progress', { keyPath: 'examId' });
        }
      };
    });
  }

  async ready() {
    return this.readyPromise;
  }

  // --- Transactions Helper ---
  _tx(storeNames, mode) {
    return this.db.transaction(storeNames, mode);
  }

  // --- Exam Operations ---

  async saveExam(exam) {
    await this.ready();
    return new Promise((resolve, reject) => {
      // Ensure exam has an ID and timestamp
      if (!exam.id) exam.id = crypto.randomUUID();
      if (!exam.addedAt) exam.addedAt = new Date().toISOString();
      if (!exam.folderId) exam.folderId = 'uncategorized';

      const tx = this._tx(['exams'], 'readwrite');
      const store = tx.objectStore('exams');
      const request = store.put(exam);

      request.onsuccess = () => resolve(exam.id);
      request.onerror = () => reject(request.error);
    });
  }

  async getExams() {
    await this.ready();
    return new Promise((resolve, reject) => {
      const tx = this._tx(['exams'], 'readonly');
      const store = tx.objectStore('exams');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getExam(id) {
    await this.ready();
    return new Promise((resolve, reject) => {
      const tx = this._tx(['exams'], 'readonly');
      const store = tx.objectStore('exams');
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteExam(id) {
    await this.ready();
    return new Promise((resolve, reject) => {
      const tx = this._tx(['exams', 'progress'], 'readwrite');
      
      // Delete exam
      tx.objectStore('exams').delete(id);
      
      // Delete associated progress
      tx.objectStore('progress').delete(id);

      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  // --- Folder Operations ---

  async saveFolder(folder) {
    await this.ready();
    return new Promise((resolve, reject) => {
      if (!folder.id) folder.id = crypto.randomUUID();
      
      const tx = this._tx(['folders'], 'readwrite');
      const request = tx.objectStore('folders').put(folder);

      request.onsuccess = () => resolve(folder.id);
      request.onerror = () => reject(request.error);
    });
  }

  async getFolders() {
    await this.ready();
    return new Promise((resolve, reject) => {
      const tx = this._tx(['folders'], 'readonly');
      const request = tx.objectStore('folders').getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  
  async deleteFolder(id) {
    await this.ready();
    
    // Get exams in this folder first
    const allExams = await this.getExams();
    const examsInFolder = allExams.filter(e => e.folderId === id);
    
    // Use a single transaction for both updating exams and deleting folder
    return new Promise((resolve, reject) => {
      const tx = this._tx(['exams', 'folders'], 'readwrite');
      
      // Move exams to uncategorized
      if (examsInFolder.length > 0) {
        const examStore = tx.objectStore('exams');
        examsInFolder.forEach(exam => {
          exam.folderId = 'uncategorized';
          examStore.put(exam);
        });
      }
      
      // Delete folder
      tx.objectStore('folders').delete(id);
      
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // --- Progress Operations ---

  async saveProgress(progress) {
    await this.ready();
    return new Promise((resolve, reject) => {
      const tx = this._tx(['progress'], 'readwrite');
      const request = tx.objectStore('progress').put(progress);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getProgress(examId) {
    await this.ready();
    return new Promise((resolve, reject) => {
      const tx = this._tx(['progress'], 'readonly');
      const request = tx.objectStore('progress').get(examId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // --- Import/Export ---
  
  async exportData() {
    const exams = await this.getExams();
    const folders = await this.getFolders();
    const progressRef = await new Promise((resolve) => {
        const tx = this.db.transaction(['progress'], 'readonly');
        tx.objectStore('progress').getAll().onsuccess = (e) => resolve(e.target.result);
    });
    
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      exams,
      folders,
      progress: progressRef
    };
  }

  async importData(data) {
    if (!data.exams) throw new Error("Invalid data format: missing 'exams'");
    
    await this.ready();
    const tx = this._tx(['exams', 'folders', 'progress'], 'readwrite');
    
    // Clear existing? Or merge? 
    // Let's Merge for now, overwriting if ID exists
    
    data.exams.forEach(item => tx.objectStore('exams').put(item));
    if (data.folders) data.folders.forEach(item => tx.objectStore('folders').put(item));
    if (data.progress) data.progress.forEach(item => tx.objectStore('progress').put(item));
    
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }
  
  // --- Clear All Data ---
  
  async clearAll() {
    await this.ready();
    return new Promise((resolve, reject) => {
      const tx = this._tx(['exams', 'folders', 'progress'], 'readwrite');
      tx.objectStore('exams').clear();
      tx.objectStore('folders').clear();
      tx.objectStore('progress').clear();
      
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }
}

// Global instance
window.storage = new ExamStorage();
