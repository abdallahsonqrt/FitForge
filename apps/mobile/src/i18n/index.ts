import { useCallback, useMemo } from 'react';
import { I18nManager, Platform } from 'react-native';
import { usePreferencesStore } from '../store/preferencesStore';
import { en, type TranslationKey, type Translations } from './translations/en';
import { ar } from './translations/ar';
import { es } from './translations/es';
import { fr } from './translations/fr';
import { de } from './translations/de';

const LOCALES: Record<string, Translations> = { en, ar, es, fr, de };

/** Locales that lay out right-to-left. */
export const RTL_LANGUAGES = ['ar'];

export const isRtlLanguage = (language: string): boolean => RTL_LANGUAGES.includes(language);

type Params = Record<string, string | number>;

const interpolate = (template: string, params?: Params): string => {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  );
};

/**
 * Reads the language straight from the preferences store, so picking a new one
 * re-renders every subscribed screen — the whole point of the setting. Falls back
 * to English per key, so a locale that is missing a string shows readable copy
 * rather than the raw key.
 */
export const useTranslation = () => {
  const language = usePreferencesStore((state) => state.language);
  const dictionary = LOCALES[language] ?? en;

  const t = useCallback(
    (key: TranslationKey, params?: Params): string =>
      interpolate(dictionary[key] ?? en[key] ?? key, params),
    [dictionary],
  );

  return useMemo(
    () => ({ t, language, isRTL: isRtlLanguage(language) }),
    [t, language],
  );
};

/**
 * Native needs `I18nManager` flipped for RTL, and it only takes effect after a
 * reload — so this records the intent and the caller tells the user to restart.
 *
 * Web has no such constraint: `react-native-web`'s I18nManager is an inert stub
 * (`forceRTL` returns nothing and it exposes `isRTL` only through `getConstants`,
 * never as a property), so setting `document.dir` is both what actually flips the
 * layout and why no restart is ever needed there.
 */
export const applyLayoutDirection = (language: string): { needsRestart: boolean } => {
  const shouldBeRTL = isRtlLanguage(language);

  if (Platform.OS === 'web') {
    if (typeof document !== 'undefined') {
      document.documentElement.dir = shouldBeRTL ? 'rtl' : 'ltr';
      document.documentElement.lang = language;
    }
    return { needsRestart: false };
  }

  // Read through `getConstants()` — the property form is not present on every
  // platform, and `undefined === false` would report a restart on every change.
  const currentlyRTL = I18nManager.getConstants().isRTL;
  if (currentlyRTL === shouldBeRTL) return { needsRestart: false };

  I18nManager.allowRTL(shouldBeRTL);
  I18nManager.forceRTL(shouldBeRTL);
  return { needsRestart: true };
};

export type { TranslationKey };
