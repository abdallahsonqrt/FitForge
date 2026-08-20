import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Link, router } from 'expo-router';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { KeyboardAvoidingWrapper } from '../../src/components/layout/KeyboardAvoidingWrapper';
import { ScreenContainer } from '../../src/components/layout/ScreenContainer';
import { Input, Button } from '../../src/components/ui';
import { Mail, ArrowLeft, AlertCircle } from 'lucide-react-native';
import { useForgotPassword } from '../../src/features/auth/api/usePasswordReset';
import { getApiErrorMessage } from '../../src/lib/api';
import { emailValidator } from '../../src/utils/validators';
import { useTranslation } from '../../src/i18n';

export default function ForgotPasswordScreen() {
  const { styles, theme } = useStyles(stylesheet);
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [isSent, setIsSent] = useState(false);

  const forgotPassword = useForgotPassword();

  const handleSend = () => {
    const trimmed = email.trim();
    const validation = emailValidator.safeParse(trimmed);
    if (!validation.success) {
      setFieldError(validation.error.issues[0]?.message);
      return;
    }

    forgotPassword.mutate(trimmed.toLowerCase(), {
      // The API answers 202 for unknown addresses too, so this is "the request
      // went through", not "an account exists" — the copy below says as much.
      onSuccess: () => setIsSent(true),
    });
  };

  return (
    <KeyboardAvoidingWrapper>
      <ScreenContainer style={styles.container}>
        <Link href="/(auth)/login" asChild>
          <Pressable
            style={styles.backButton}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('auth.forgot.backToLogin')}
          >
            <ArrowLeft color={theme.colors.text} size={24} />
          </Pressable>
        </Link>

        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            {t('auth.forgot.heading')}
          </Text>
          <Text style={styles.subtitle}>{t('auth.forgot.subtitle')}</Text>
        </View>

        {isSent ? (
          <View style={styles.successContainer} accessibilityLiveRegion="polite">
            <Text style={styles.successText}>{t('auth.forgot.sentBody', { email })}</Text>
            <Button
              title={t('auth.forgot.backToLogin')}
              onPress={() => router.replace('/(auth)/login')}
              style={styles.submitButton}
            />
          </View>
        ) : (
          <View style={styles.form}>
            <Input
              label={t('auth.login.email')}
              placeholder={t('auth.forgot.emailPlaceholder')}
              value={email}
              onChangeText={(value) => {
                setEmail(value);
                if (fieldError) setFieldError(undefined);
                if (forgotPassword.isError) forgotPassword.reset();
              }}
              error={fieldError}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              returnKeyType="send"
              onSubmitEditing={handleSend}
              leftIcon={<Mail color={theme.colors.textSecondary} size={20} />}
            />

            {forgotPassword.isError && (
              <View style={styles.errorBanner} accessibilityLiveRegion="polite">
                <AlertCircle color={theme.colors.error} size={18} />
                <Text style={styles.errorText}>
                  {getApiErrorMessage(forgotPassword.error, t('common.somethingWentWrong'))}
                </Text>
              </View>
            )}

            <Button
              title={t('auth.forgot.sendResetLink')}
              onPress={handleSend}
              loading={forgotPassword.isPending}
              disabled={!email.trim()}
              style={styles.submitButton}
            />
          </View>
        )}
      </ScreenContainer>
    </KeyboardAvoidingWrapper>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  container: {
    paddingTop: theme.spacing['2xl'],
  },
  backButton: {
    marginBottom: theme.spacing.xl,
    padding: theme.spacing.sm,
    marginLeft: -theme.spacing.sm,
  },
  header: {
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
  form: {
    marginBottom: theme.spacing.xl,
  },
  submitButton: {
    marginTop: theme.spacing.lg,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.errorSoft,
  },
  errorText: {
    ...theme.typography.bodySm,
    color: theme.colors.error,
    flexShrink: 1,
  },
  successContainer: {
    backgroundColor: theme.colors.successSoft,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.successSoft,
  },
  successText: {
    ...theme.typography.bodyMd,
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
    textAlign: 'center',
  },
}));
