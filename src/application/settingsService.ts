/**
 * SettingsService — Application-layer settings persistence (Phase 16)
 *
 * Provides a clean API for UI preferences that survive page reloads.
 * Backed by IndexedDB via the shared ExamStorage instance.
 *
 * Settings are UI-only. They never affect domain logic, telemetry,
 * scoring, or exam schemas.
 *
 * Forbidden in this module:
 * - DOM access
 * - Domain imports
 * - Localization
 */

import type { ExamStorage, AppSettings } from "../storage/db.js";

export type { AppSettings };

export type TabId = AppSettings["lastOpenedTab"];

/**
 * Application settings service.
 *
 * Wraps ExamStorage settings methods with a small in-memory cache
 * so repeated reads don't hit IndexedDB.
 */
export class SettingsService {
  private storage: ExamStorage;
  private cache: AppSettings | null = null;

  constructor(storage: ExamStorage) {
    this.storage = storage;
  }

  /**
   * Load settings from IndexedDB (or return cached).
   */
  async load(): Promise<AppSettings> {
    if (this.cache) return { ...this.cache };
    const settings = await this.storage.loadSettings();
    this.cache = settings;
    return { ...settings };
  }

  /**
   * Save a single setting and update cache.
   */
  async set<K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ): Promise<void> {
    await this.storage.saveSetting(key, value);
    if (this.cache) {
      this.cache[key] = value;
    }
  }

  /**
   * Get the last opened tab, defaulting to "library".
   */
  async getLastOpenedTab(): Promise<TabId> {
    const settings = await this.load();
    return settings.lastOpenedTab;
  }

  /**
   * Persist the currently active tab.
   */
  async setLastOpenedTab(tab: TabId): Promise<void> {
    await this.set("lastOpenedTab", tab);
  }

  /**
   * Get the persisted language preference.
   */
  async getLanguage(): Promise<AppSettings["language"]> {
    const settings = await this.load();
    return settings.language;
  }

  /**
   * Persist the language preference.
   */
  async setLanguage(lang: AppSettings["language"]): Promise<void> {
    await this.set("language", lang);
  }
}
