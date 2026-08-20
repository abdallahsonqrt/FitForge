import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { AlertCircle, Lock } from 'lucide-react-native';
import { KeyboardAvoidingWrapper } from '../../src/components/layout/KeyboardAvoidingWrapper';
import { ScreenContainer } from '../../src/components/layout/ScreenContainer';
import { Button, Input } from '../../src/components/ui';
import { useResetPassword } from '../../src/features/auth/api/usePasswordReset';
import { getApiErrorMessage } from '../../src/lib/api';
import { passwordValidator } from '../../src/utils/validators';
import { useTranslation } from '../../src/i18n';

/**
 * Where a reset link lands: `/reset-password?token=…`.
 *
 * Lives in the `(auth)` group so an unauthenticated visitor can reach it, which
 * is the only state anyone following a reset link is in.
 */
export default function ResetPasswordScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { styles, theme } = useStyles(stylesheet);
  const { t } = useTranslation();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();

  const resetPassword = useResetPassword();

  const submit = () => {
    const validation = passwordValidator.safeParse(password);
    if (!validation.success) {
      setFieldError(validation.error.issues[0]?.message);
      return;
    }
    if (password !== confirm) {
      setFieldError(t('auth.reset.mismatch'));
      return;
    }
    if (!token) return;

    resetPassword.mutate(
      { token, password },
      {
        // Every session was just destroyed server-side, so there is nothing to
        // return to — sign-in is the only next step.
        onSuccess: () => router.replace('/(auth)/login'),
      },
    );
  };

  // A link with no token is not recoverable from this screen.
  if (!token) {
    return (
      <ScreenContainer style={styles.container}>
        <Text style={styles.title} accessibilityRole="header">
          {t('auth.reset.title')}
        </Text>
        <Text style={styles.subtitle}>{t('auth.reset.invalidLink')}</Text>
        <Button
          title={t('auth.forgot.heading')}
          onPress={() => router.replace('/(auth)/forgot-password')}
          style={styles.submit}
        />
      </ScreenContainer>
    );
  }

  return (
    <KeyboardAvoidingWrapper>
      <ScreenContainer style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            {t('auth.reset.title')}
          </Text>
          <Text style={styles.subtitle}>{t('auth.reset.subtitle')}</Text>
        </View>

        <Input
          label={t('auth.reset.newPassword')}
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            if (fieldError) setFieldError(undefined);
            if (resetPassword.isError) resetPassword.reset();
          }}
          secureTextEntry
          autoComplete="new-password"
          leftIcon={<Lock color={theme.colors.textSecondary} size={20} />}
        />
        <Input
          label={t('auth.reset.confirmPassword')}
          value={confirm}
          onChangeText={(value) => {
            setConfirm(value);
            if (fieldError) setFieldError(undefined);
          }}
          error={fieldError}
          secureTextEntry
          autoComplete="new-password"
          returnKeyType="done"
          onSubmitEditing={submit}
          leftIcon={<Lock color={theme.colors.textSecondary} size={20} />}
        />

        {resetPassword.isError && (
          <View style={styles.errorBanner} accessibilityLiveRegion="polite">
            <AlertCircle color={theme.colors.error} size={18} />
            <Text style={styles.errorText}>
              {getApiErrorMessage(resetPassword.error, t('auth.reset.failed'))}
            </Text>
          </View>
        )}

        <Button
          title={t('auth.reset.submit')}
          onPress={submit}
          loading={resetPassword.isPending}
          disabled={!password || !confirm}
          style={styles.submit}
        />
      </ScreenContainer>
    </KeyboardAvoidingWrapper>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  container: { paddingTop: theme.spacing['2xl'] },
  header: { marginBottom: theme.spacing.xl },
  title: {
    ...theme.typography.displayMd,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  subtitle: { ...theme.typography.bodyLg, color: theme.colors.textSecondary },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.errorSoft,
  },
  errorText: { ...theme.typography.bodySm, color: theme.colors.error, flexShrink: 1 },
  submit: { marginTop: theme.spacing.lg },
}));
