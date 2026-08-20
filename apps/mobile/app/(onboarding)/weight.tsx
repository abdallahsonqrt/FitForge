import React, { useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { router } from 'expo-router';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { ScreenContainer } from '../../src/components/layout/ScreenContainer';
import { useTranslation } from '../../src/i18n';
import { ProgressBar, Button } from '../../src/components/ui';
import { useOnboardingStore } from '../../src/store/onboardingStore';
import { KeyboardAvoidingWrapper } from '../../src/components/layout/KeyboardAvoidingWrapper';

export default function WeightScreen() {
  const { styles, theme } = useStyles(stylesheet);
  const { t } = useTranslation();
  const { data, setField } = useOnboardingStore();
  const [weightStr, setWeightStr] = useState(data.weight?.value ? data.weight.value.toString() : '');
  const [unit, setUnit] = useState<'kg' | 'lbs'>(data.weight?.unit || 'kg');

  const handleNext = () => {
    const weight = parseFloat(weightStr);
    if (!isNaN(weight) && weight > 0) {
      setField('weight', { value: weight, unit });
      router.push('/(onboarding)/fitness-goal');
    }
  };

  return (
    <KeyboardAvoidingWrapper>
      <ScreenContainer>
        <ProgressBar progress={4 / 13} height={4} color={theme.colors.primary} />
        
        <View style={styles.header}>
          <Text style={styles.title}>{t('onboarding.weight.title')}</Text>
          <Text style={styles.subtitle}>{t('onboarding.weight.subtitle')}</Text>
        </View>

        <View style={styles.toggleContainer}>
          <Pressable
            style={[styles.toggleButton, unit === 'kg' && styles.toggleButtonActive]}
            onPress={() => setUnit('kg')}
          >
            <Text style={[styles.toggleText, unit === 'kg' && styles.toggleTextActive]}>KG</Text>
          </Pressable>
          <Pressable
            style={[styles.toggleButton, unit === 'lbs' && styles.toggleButtonActive]}
            onPress={() => setUnit('lbs')}
          >
            <Text style={[styles.toggleText, unit === 'lbs' && styles.toggleTextActive]}>LBS</Text>
          </Pressable>
        </View>

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={weightStr}
            onChangeText={setWeightStr}
            keyboardType="decimal-pad"
            maxLength={5}
            placeholder={unit === 'kg' ? '70' : '155'}
            placeholderTextColor={theme.colors.textSecondary}
            autoFocus
          />
          <Text style={styles.unitLabel}>{unit}</Text>
        </View>

        <View style={{ flex: 1 }} />

        <Button
          title={t('common.continue')}
          onPress={handleNext}
          disabled={!weightStr}
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
