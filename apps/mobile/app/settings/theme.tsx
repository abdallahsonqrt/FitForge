import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { ScreenContainer } from '../../src/components/layout/ScreenContainer';
import { useTranslation, type TranslationKey } from '../../src/i18n';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { CheckCircle2, Sun, Moon, Monitor } from 'lucide-react-native';
import { usePreferencesStore, type ThemePreference } from '../../src/store/preferencesStore';

const OPTIONS: { id: ThemePreference; labelKey: TranslationKey; icon: typeof Sun }[] = [
  { id: 'light', labelKey: 'settings.theme.light', icon: Sun },
  { id: 'dark', labelKey: 'settings.theme.dark', icon: Moon },
  { id: 'system', labelKey: 'settings.theme.system', icon: Monitor },
];

export default function ThemeScreen() {
  const { styles, theme } = useStyles(stylesheet);
  const { t } = useTranslation();
  // Persisted in MMKV and applied by the root layout, so the choice survives restarts.
  const activeTheme = usePreferencesStore((state) => state.theme);
  const setTheme = usePreferencesStore((state) => state.setTheme);

  return (
    <ScreenContainer contentContainerStyle={styles.content}>
      <View style={styles.previewCard}>
        <Text style={styles.previewText}>{t('settings.theme.preview')}</Text>
        <Text style={styles.previewBody}>
          {t('settings.theme.previewBody')}
        </Text>
        <View style={styles.previewButton} />
      </View>

      <View style={styles.optionsContainer}>
        {OPTIONS.map((option) => {
          const isActive = activeTheme === option.id;
          return (
            <Pressable
              key={option.id}
              style={[styles.optionRow, isActive && styles.optionRowActive]}
              onPress={() => setTheme(option.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected: isActive }}
            >
              <View style={styles.optionIconInfo}>
                <option.icon
                  size={24}
                  color={isActive ? theme.colors.primary : theme.colors.textSecondary}
                />
                <Text style={[styles.optionText, isActive && styles.optionTextActive]}>
                  {t(option.labelKey)}
                </Text>
              </View>
              {isActive && <CheckCircle2 size={24} color={theme.colors.primary} />}
            </Pressable>
          );
        })}
      </View>
    </ScreenContainer>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  content: {},
  previewCard: {
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.xl,
  },
  previewText: { color: theme.colors.text, ...theme.typography.headingMd },
  previewBody: { color: theme.colors.textSecondary, ...theme.typography.bodySm },
  previewButton: {
    height: 40,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.full,
    marginTop: theme.spacing.sm,
  },
  optionsContainer: { gap: theme.spacing.sm },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  optionRowActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft },
  optionIconInfo: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  optionText: { color: theme.colors.text, ...theme.typography.bodyLg },
  optionTextActive: { color: theme.colors.primary, fontWeight: '600' },
}));
