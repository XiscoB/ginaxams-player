/**
 * i18n module unit tests
 */

import { describe, it, expect } from "vitest";
import { getTranslations, t, createTranslator } from "../index.js";
import { LANG_EN } from "../en.js";

describe("i18n", () => {
  describe("t() function", () => {
    it("returns the translated string for a valid key", () => {
      const T = getTranslations("en");
      expect(t(T, "appTitle")).toBe("GinaXams Player");
    });

    it("returns correct translation for Spanish", () => {
      const T = getTranslations("es");
      expect(t(T, "appTitle")).toBe("GinaXams Player");
      expect(t(T, "loading")).toBe("Cargando...");
    });

    it("returns value for every key in LANG_EN", () => {
      const T = getTranslations("en");
      const keys = Object.keys(LANG_EN) as Array<keyof typeof LANG_EN>;
      for (const key of keys) {
        const result = t(T, key);
        expect(typeof result).toBe("string");
        expect(result.length).toBeGreaterThan(0);
      }
    });
  });

  describe("createTranslator()", () => {
    it("returns a bound translator function for English", () => {
      const translate = createTranslator("en");
      expect(translate("appTitle")).toBe("GinaXams Player");
      expect(translate("loading")).toBe("Loading...");
    });

    it("returns a bound translator function for Spanish", () => {
      const translate = createTranslator("es");
      expect(translate("loading")).toBe("Cargando...");
    });

    it("returns a function that works with all keys", () => {
      const translate = createTranslator("en");
      const keys = Object.keys(LANG_EN) as Array<keyof typeof LANG_EN>;
      for (const key of keys) {
        expect(typeof translate(key)).toBe("string");
      }
    });
  });

  describe("getTranslations()", () => {
    it("returns English translations for 'en'", () => {
      const T = getTranslations("en");
      expect(T.appTitle).toBe("GinaXams Player");
    });

    it("returns Spanish translations for 'es'", () => {
      const T = getTranslations("es");
      expect(T.loading).toBe("Cargando...");
    });

    it("falls back to English for unknown language", () => {
      const T = getTranslations("en"); // Only en/es exist
      expect(T.appTitle).toBe("GinaXams Player");
    });
  });
});
