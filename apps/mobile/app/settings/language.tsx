import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { ScreenContainer } from '../../src/components/layout/ScreenContainer';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { Check } from 'lucide-react-native';
import { SUPPORTED_LANGUAGES, usePreferencesStore } from '../../src/store/preferencesStore';
import { applyLayoutDirection, useTranslation } from '../../src/i18n';
import { useUpdateProfile } from '../../src/features/users/api/useMe';
import { useAuthStore } from '../../src/store/authStore';

export default function LanguageScreen() {
  const { styles, theme } = useStyles(stylesheet);
  const { t } = useTranslation();

  const activeLanguage = usePreferencesStore((state) => state.language);
  const setLanguage = usePreferencesStore((state) => state.setLanguage);

  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const updateProfile = useUpdateProfile();

  const [needsRestart, setNeedsRestart] = useState(false);

  const handleSelect = (code: string) => {
    if (code === activeLanguage) return;

    setLanguage(code);

    // Native has to be told to flip the layout, and only picks it up on reload.
    const { needsRestart: restartRequired } = applyLayoutDirection(code);
    setNeedsRestart(restartRequired);

    // Best effort: the preference is already stored locally, so a failed sync
    // must not undo the switch the user just made.
    if (isAuthenticated) {
      updateProfile.mutate({ language: code });
    }
  };

  return (
    <ScreenContainer contentContainerStyle={styles.content}>
      <Text style={styles.note}>{t('settings.language.note')}</Text>

      {needsRestart && (
        <View style={styles.restartBanner}>
          <Text style={styles.restartText}>{t('settings.language.restartHint')}</Text>
        </View>
      )}

      <View style={styles.list}>
        {SUPPORTED_LANGUAGES.map((language) => {
          const isActive = activeLanguage === language.code;
          return (
            <Pressable
              key={language.code}
              style={[styles.row, isActive && styles.rowActive]}
              onPress={() => handleSelect(language.code)}
              accessibilityRole="radio"
              accessibilityState={{ selected: isActive }}
            >
              <View>
                <Text style={[styles.langLabel, isActive && styles.textActive]}>{language.label}</Text>
                <Text style={styles.langNative}>{language.nativeLabel}</Text>
              </View>
              {isActive && <Check size={20} color={theme.colors.primary} />}
            </Pressable>
          );
        })}
      </View>
    </ScreenContainer>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  content: { gap: theme.spacing.lg },
  note: { color: theme.colors.textSecondary, ...theme.typography.bodySm },
  restartBanner: {
    padding: theme.spacing.md,
    backgroundColor: theme.colors.primarySoft,
    borderRadius: theme.borderRadius.md,
  },
  restartText: { color: theme.colors.primary, ...theme.typography.bodySm },
  list: { gap: theme.spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  rowActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft },
  langLabel: { color: theme.colors.text, ...theme.typography.bodyLg },
  langNative: { color: theme.colors.textSecondary, ...theme.typography.bodySm, marginTop: 2 },
  textActive: { color: theme.colors.primary, fontWeight: '600' },
}));
