import React, { useState } from 'react';
import { View, Text, TextInput } from 'react-native';
import { router } from 'expo-router';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { ScreenContainer } from '../../src/components/layout/ScreenContainer';
import { useTranslation } from '../../src/i18n';
import { ProgressBar, Button } from '../../src/components/ui';
import { useOnboardingStore } from '../../src/store/onboardingStore';
import { KeyboardAvoidingWrapper } from '../../src/components/layout/KeyboardAvoidingWrapper';

export default function AgeScreen() {
  const { styles, theme } = useStyles(stylesheet);
  const { t } = useTranslation();
  const { data, setField } = useOnboardingStore();
  const [ageStr, setAgeStr] = useState(data.age ? data.age.toString() : '');

  const handleNext = () => {
    const age = parseInt(ageStr, 10);
    if (!isNaN(age) && age > 0) {
      setField('age', age);
      router.push('/(onboarding)/height');
    }
  };

  return (
    <KeyboardAvoidingWrapper>
      <ScreenContainer>
        <ProgressBar progress={2 / 13} height={4} color={theme.colors.primary} />
        
        <View style={styles.header}>
          <Text style={styles.title}>{t('onboarding.age.title')}</Text>
          <Text style={styles.subtitle}>{t('onboarding.age.subtitle')}</Text>
        </View>

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={ageStr}
            onChangeText={setAgeStr}
            keyboardType="number-pad"
            maxLength={3}
            placeholder="25"
            placeholderTextColor={theme.colors.textSecondary}
            autoFocus
          />
        </View>

        <View style={{ flex: 1 }} />

        <Button
          title={t('common.continue')}
          onPress={handleNext}
          disabled={!ageStr}
          style={styles.button}
        />
      </ScreenContainer>
    </KeyboardAvoidingWrapper>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  header: {
    marginTop: theme.spacing['2xl'],
    marginBottom: theme.spacing['3xl'],
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
  inputContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: theme.spacing['3xl'],
  },
  input: {
    ...theme.typography.displayLg,
    fontSize: 72,
    color: theme.colors.text,
    borderBottomWidth: 2,
    borderBottomColor: theme.colors.primary,
    minWidth: 120,
    textAlign: 'center',
    outlineStyle: 'none',
  },
  button: {
    marginBottom: theme.spacing.xl,
  },
}));
