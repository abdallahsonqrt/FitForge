import React, { useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { router } from 'expo-router';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { ScreenContainer } from '../../src/components/layout/ScreenContainer';
import { useTranslation } from '../../src/i18n';
import { ProgressBar, Button } from '../../src/components/ui';
import { useOnboardingStore } from '../../src/store/onboardingStore';
import { KeyboardAvoidingWrapper } from '../../src/components/layout/KeyboardAvoidingWrapper';

export default function HeightScreen() {
  const { styles, theme } = useStyles(stylesheet);
  const { t } = useTranslation();
  const { data, setField } = useOnboardingStore();
  const [heightStr, setHeightStr] = useState(data.height?.value ? data.height.value.toString() : '');
  const [unit, setUnit] = useState<'cm' | 'ft'>(data.height?.unit || 'cm');

  const handleNext = () => {
    const height = parseFloat(heightStr);
    if (!isNaN(height) && height > 0) {
      setField('height', { value: height, unit });
      router.push('/(onboarding)/weight');
    }
  };

  return (
    <KeyboardAvoidingWrapper>
      <ScreenContainer>
        <ProgressBar progress={3 / 13} height={4} color={theme.colors.primary} />
        
        <View style={styles.header}>
          <Text style={styles.title}>{t('onboarding.height.title')}</Text>
          <Text style={styles.subtitle}>{t('onboarding.height.subtitle')}</Text>
        </View>

        <View style={styles.toggleContainer}>
          <Pressable
            style={[styles.toggleButton, unit === 'cm' && styles.toggleButtonActive]}
            onPress={() => setUnit('cm')}
          >
            <Text style={[styles.toggleText, unit === 'cm' && styles.toggleTextActive]}>CM</Text>
          </Pressable>
          <Pressable
            style={[styles.toggleButton, unit === 'ft' && styles.toggleButtonActive]}
            onPress={() => setUnit('ft')}
          >
            <Text style={[styles.toggleText, unit === 'ft' && styles.toggleTextActive]}>FT</Text>
          </Pressable>
        </View>

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={heightStr}
            onChangeText={setHeightStr}
            keyboardType="decimal-pad"
            maxLength={5}
            placeholder={unit === 'cm' ? '175' : '5.9'}
            placeholderTextColor={theme.colors.textSecondary}
            autoFocus
          />
          <Text style={styles.unitLabel}>{unit}</Text>
        </View>

        <View style={{ flex: 1 }} />

        <Button
          title={t('common.continue')}
          onPress={handleNext}
          disabled={!heightStr}
          style={styles.button}
        />
      </ScreenContainer>
    </KeyboardAvoidingWrapper>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  header: {
    marginTop: theme.spacing['2xl'],
    marginBottom: theme.spacing.xl,
  },
  title: {
    ...theme.typography.displayMd,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    ...theme.typography.bodyLg,
    color: theme.colors.textSecondary,
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.borderRadius.full,
    padding: 4,
    alignSelf: 'center',
    marginBottom: theme.spacing['3xl'],
  },
  toggleButton: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xl,
    borderRadius: theme.borderRadius.full,
  },
  toggleButtonActive: {
    backgroundColor: theme.colors.primary,
  },
  toggleText: {
    ...theme.typography.labelLg,
    color: theme.colors.textSecondary,
  },
  toggleTextActive: {
    color: theme.colors.background,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    marginVertical: theme.spacing.xl,
  },
  input: {
    ...theme.typography.displayLg,
    fontSize: 72,
    color: theme.colors.text,
    borderBottomWidth: 2,
    borderBottomColor: theme.colors.primary,
    minWidth: 150,
    textAlign: 'center',
    outlineStyle: 'none',
  },
  unitLabel: {
    ...theme.typography.headingLg,
    color: theme.colors.textSecondary,
    marginLeft: theme.spacing.sm,
  },
  button: {
    marginBottom: theme.spacing.xl,
  },
}));
