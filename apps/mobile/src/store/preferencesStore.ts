import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { zustandStorage } from '../lib/storage';

export type ThemePreference = 'light' | 'dark' | 'system';
export type UnitPreference = 'metric' | 'imperial';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'ar', label: 'Arabic', nativeLabel: 'العربية' },
  { code: 'es', label: 'Spanish', nativeLabel: 'Español' },
  { code: 'fr', label: 'French', nativeLabel: 'Français' },
  { code: 'de', label: 'German', nativeLabel: 'Deutsch' },
] as const;

interface PreferencesState {
  theme: ThemePreference;
  language: string;
  units: UnitPreference;
  setTheme: (theme: ThemePreference) => void;
  setLanguage: (lang: string) => void;
  setUnits: (units: UnitPreference) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      theme: 'system',
      language: 'en',
      units: 'metric',
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      setUnits: (units) => set({ units }),
    }),
    {
      name: 'preferences-storage',
      storage: createJSONStorage(() => zustandStorage),
    },
  ),
);

export const languageLabel = (code: string): string =>
  SUPPORTED_LANGUAGES.find((lang) => lang.code === code)?.label ?? code.toUpperCase();
