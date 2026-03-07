/**
 * Settings Persistence Tests (Phase 16)
 *
 * Tests the SettingsService application-layer logic.
 * Uses a mock storage implementation to avoid IndexedDB dependency.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { SettingsService } from "../application/settingsService.js";
import type { AppSettings } from "../storage/db.js";

// ============================================================================
// Mock Storage
// ============================================================================

function createMockStorage() {
  const store = new Map<string, unknown>();

  return {
    loadSettings: vi.fn(async (): Promise<AppSettings> => {
      const settings: AppSettings = {
        lastOpenedTab:
          (store.get("lastOpenedTab") as AppSettings["lastOpenedTab"]) ??
          "library",
        language: (store.get("language") as AppSettings["language"]) ?? "en",
      };
      return settings;
    }),
    saveSetting: vi.fn(
      async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
        store.set(key, value);
      },
    ),
    saveSettings: vi.fn(async (settings: Partial<AppSettings>) => {
      for (const [key, value] of Object.entries(settings)) {
        store.set(key, value);
      }
    }),
    // Expose internal store for assertions
    _store: store,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("SettingsService", () => {
  let service: SettingsService;
  let mockStorage: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    mockStorage = createMockStorage();
    // Cast to satisfy the ExamStorage interface (we only use settings methods)
    service = new SettingsService(
      mockStorage as unknown as import("../storage/db.js").ExamStorage,
    );
  });

  describe("load()", () => {
    it("returns default settings on first load", async () => {
      const settings = await service.load();
      expect(settings.lastOpenedTab).toBe("library");
      expect(settings.language).toBe("en");
    });

    it("caches settings after first load", async () => {
      await service.load();
      await service.load();
      // Should only call storage once
      expect(mockStorage.loadSettings).toHaveBeenCalledTimes(1);
    });

    it("returns a copy, not the cached reference", async () => {
      const s1 = await service.load();
      const s2 = await service.load();
      expect(s1).not.toBe(s2);
      expect(s1).toEqual(s2);
    });
  });

  describe("set()", () => {
    it("persists lastOpenedTab to storage", async () => {
      await service.set("lastOpenedTab", "telemetry");
      expect(mockStorage.saveSetting).toHaveBeenCalledWith(
        "lastOpenedTab",
        "telemetry",
      );
    });

    it("persists language to storage", async () => {
      await service.set("language", "es");
      expect(mockStorage.saveSetting).toHaveBeenCalledWith("language", "es");
    });

    it("updates cache after set", async () => {
      await service.load(); // populate cache
      await service.set("lastOpenedTab", "insights");
      const settings = await service.load();
      expect(settings.lastOpenedTab).toBe("insights");
    });
  });

  describe("getLastOpenedTab()", () => {
    it("returns library by default", async () => {
      const tab = await service.getLastOpenedTab();
      expect(tab).toBe("library");
    });

    it("returns saved tab", async () => {
      mockStorage._store.set("lastOpenedTab", "telemetry");
      const tab = await service.getLastOpenedTab();
      expect(tab).toBe("telemetry");
    });
  });

  describe("setLastOpenedTab()", () => {
    it("persists the tab value", async () => {
      await service.setLastOpenedTab("insights");
      expect(mockStorage.saveSetting).toHaveBeenCalledWith(
        "lastOpenedTab",
        "insights",
      );
    });
  });

  describe("getLanguage()", () => {
    it("returns en by default", async () => {
      const lang = await service.getLanguage();
      expect(lang).toBe("en");
    });
  });

  describe("setLanguage()", () => {
    it("persists language to storage", async () => {
      await service.setLanguage("es");
      expect(mockStorage.saveSetting).toHaveBeenCalledWith("language", "es");
    });
  });

  describe("tab restore behavior", () => {
    it("restore flow: save tab → reload → get same tab", async () => {
      // Simulate save
      await service.setLastOpenedTab("telemetry");

      // Simulate reload — new service with same backing store
      const freshService = new SettingsService(
        mockStorage as unknown as import("../storage/db.js").ExamStorage,
      );
      const tab = await freshService.getLastOpenedTab();
      expect(tab).toBe("telemetry");
    });
  });
});
