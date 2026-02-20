/**
 * Internationalization module
 * 
 * Provides type-safe access to translation strings.
 */

import { LANG_EN, type TranslationKey } from "./en.js";
import { LANG_ES } from "./es.js";

export type LanguageCode = "en" | "es";

// Use a type that covers both translations
export type Translations = typeof LANG_EN;

const translations: Record<LanguageCode, Translations> = {
  en: LANG_EN,
  es: LANG_ES as unknown as Translations,
};

/**
 * Get translations for a given language code.
 * Falls back to English if the language is not found.
 * 
 * @param lang - Language code ("en" | "es")
 * @returns Translation strings for the language
 */
export function getTranslations(lang: LanguageCode): Translations {
  return translations[lang] ?? translations.en;
}

/**
 * Detect the browser's preferred language.
 * Returns "es" for Spanish variants, "en" for everything else.
 * 
 * @returns Detected language code
 */
export function detectBrowserLanguage(): LanguageCode {
  const browserLang = navigator.language || (navigator as { userLanguage?: string }).userLanguage || "en";
  const langCode = browserLang.toLowerCase().split("-")[0];
  return langCode === "es" ? "es" : "en";
}

export { LANG_EN, LANG_ES };
export type { TranslationKey };
