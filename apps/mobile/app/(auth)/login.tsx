import React, { useState } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { Link, router } from 'expo-router';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { Mail, Lock, AlertCircle } from 'lucide-react-native';
import { KeyboardAvoidingWrapper } from '../../src/components/layout/KeyboardAvoidingWrapper';
import { ScreenContainer } from '../../src/components/layout/ScreenContainer';
import { useTranslation } from '../../src/i18n';
import { Input, Button } from '../../src/components/ui';
import { useLogin } from '../../src/features/auth/api/useLogin';
import { getApiErrorMessage, isRejectedCredential } from '../../src/lib/api';
import { homeHrefFor } from '../../src/lib/routing';
import { emailValidator } from '../../src/utils/validators';

/**
 * Wraps the fields in a real `<form>` on web and gets out of the way everywhere else.
 *
 * `react-native-web` renders every `View` as a `div`, so without this the inputs sit
 * in no form at all — which is the signal browsers and password managers use to
 * decide whether to offer saving a credential. `display: contents` makes the element
 * generate no box, so the layout is byte-for-byte what it was before. On native the
 * component collapses to a fragment and the render tree is untouched.
 */
const FormWrapper =
  Platform.OS === 'web'
    ? ({ children, onSubmit }: { children: React.ReactNode; onSubmit: () => void }) =>
        React.createElement(
          'form',
          {
            style: { display: 'contents' },
            onSubmit: (event: { preventDefault: () => void }) => {
              // Let the existing handler own submission; a real navigation would
              // reload the single-page app and throw the session away.
              event.preventDefault();
              onSubmit();
            },
          },
          children,
        )
    : ({ children }: { children: React.ReactNode; onSubmit: () => void }) => <>{children}</>;

export default function LoginScreen() {
  const { styles, theme } = useStyles(stylesheet);
  const { t } = useTranslation();
  const login = useLogin();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  const validate = () => {
    const errors: typeof fieldErrors = {};
    const trimmedEmail = email.trim();
    // An empty box has not been filled in wrongly, it has not been filled in at
    // all — "invalid email" is the first thing a new user would otherwise read.
    if (!trimmedEmail) {
      errors.email = t('auth.login.emailRequired');
    } else {
      const emailResult = emailValidator.safeParse(trimmedEmail);
      if (!emailResult.success) errors.email = emailResult.error.issues[0].message;
    }
    if (!password) errors.password = t('auth.login.passwordRequired');

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  /**
   * The banner is rendered from the mutation's error state, which survives until
   * the next `mutate()`. Field errors already clear as the user types, so without
   * this a corrected form still sits under a red "Invalid credentials" bar.
   */
  const clearSubmitError = () => {
    if (login.isError) login.reset();
  };

  const handleLogin = () => {
    if (!validate()) return;
    login.mutate(
      { email: email.trim().toLowerCase(), password },
      {
        // `homeHrefFor` owns this rule — spelling it out inline here dropped the
        // role branch, so a coach signing in landed in the athlete tabs.
        onSuccess: (user) => router.replace(homeHrefFor(user, user.onboardingComplete)),
        /**
         * A *rejected* password is worth nothing, and a masked field of the
         * wrong length is hard to tell from an empty one — so hand back an
         * empty box rather than making the user select-all and delete before
         * retrying.
         *
         * Only on a rejection, though. This used to clear on every error, so a
         * dropped connection wiped a password the server never even saw: the
         * user reconnected, pressed Sign In again, and nothing happened,
         * because the now-empty field failed validation before the request.
         */
        onError: (error) => {
          if (isRejectedCredential(error)) setPassword('');
        },
      },
    );
  };

  return (
    <KeyboardAvoidingWrapper>
      <ScreenContainer style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>FitForge</Text>
          <Text style={styles.subtitle}>{t('auth.login.subtitle')}</Text>
        </View>

        {login.isError && (
          <View style={styles.errorBanner}>
            <AlertCircle size={18} color={theme.colors.error} />
            <Text style={styles.errorBannerText}>{getApiErrorMessage(login.error, 'Could not sign in.')}</Text>
          </View>
        )}

        <FormWrapper onSubmit={handleLogin}>
          <View style={styles.form}>
            <Input
              label={t('auth.login.email')}
              placeholder="you@example.com"
              value={email}
              onChangeText={(value) => {
                setEmail(value);
                setFieldErrors((prev) => ({ ...prev, email: undefined }));
                clearSubmitError();
              }}
              error={fieldErrors.email}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              returnKeyType="next"
              leftIcon={<Mail color={theme.colors.textSecondary} size={20} />}
            />
            <Input
              label={t('auth.login.password')}
              placeholder="Enter your password"
              value={password}
              onChangeText={(value) => {
                setPassword(value);
                setFieldErrors((prev) => ({ ...prev, password: undefined }));
                clearSubmitError();
              }}
              error={fieldErrors.password}
              secureTextEntry
              autoComplete="current-password"
              returnKeyType="go"
              onSubmitEditing={handleLogin}
              leftIcon={<Lock color={theme.colors.textSecondary} size={20} />}
            />

            <Link href="/(auth)/forgot-password" asChild>
              <Pressable style={styles.forgotPassword} hitSlop={8}>
                <Text style={styles.forgotPasswordText}>{t('auth.login.forgotPassword')}</Text>
              </Pressable>
            </Link>

            <Button title={t('auth.login.signIn')} onPress={handleLogin} loading={login.isPending} style={styles.submitButton} />
          </View>
        </FormWrapper>

        <View style={styles.footer}>
          <Text style={styles.footerText}>{t('auth.login.noAccount')} </Text>
          <Link href="/(auth)/register" asChild>
            <Pressable hitSlop={8}>
              <Text style={styles.footerLink}>{t('auth.login.signUp')}</Text>
            </Pressable>
          </Link>
        </View>
      </ScreenContainer>
    </KeyboardAvoidingWrapper>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  container: {
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: theme.spacing['2xl'],
    marginTop: theme.spacing['3xl'],
  },
  title: {
    ...theme.typography.displayLg,
    color: theme.colors.primary,
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    ...theme.typography.bodyLg,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.errorSoft,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  errorBannerText: {
    ...theme.typography.bodySm,
    color: theme.colors.error,
    flex: 1,
  },
  form: {
    marginBottom: theme.spacing.xl,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: theme.spacing.lg,
  },
  forgotPasswordText: {
    ...theme.typography.labelSm,
    color: theme.colors.primary,
  },
  submitButton: {
    marginTop: theme.spacing.md,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
  },
  footerText: {
    ...theme.typography.bodyMd,
    color: theme.colors.textSecondary,
  },
  footerLink: {
    ...theme.typography.labelMd,
    color: theme.colors.primary,
  },
}));
