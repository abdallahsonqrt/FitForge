import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Link, router } from 'expo-router';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { Mail, Lock, User, AlertCircle } from 'lucide-react-native';
import { KeyboardAvoidingWrapper } from '../../src/components/layout/KeyboardAvoidingWrapper';
import { ScreenContainer } from '../../src/components/layout/ScreenContainer';
import { Input, Button } from '../../src/components/ui';
import { useRegister } from '../../src/features/auth/api/useRegister';
import { getApiErrorMessage } from '../../src/lib/api';
import { emailValidator, nameValidator, passwordValidator } from '../../src/utils/validators';
import { useTranslation } from '../../src/i18n';

type FieldErrors = Partial<Record<'firstName' | 'lastName' | 'email' | 'password', string>>;

export default function RegisterScreen() {
  const { styles, theme } = useStyles(stylesheet);
  const { t } = useTranslation();
  const register = useRegister();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const clearError = (field: keyof FieldErrors) =>
    setFieldErrors((prev) => ({ ...prev, [field]: undefined }));

  const validate = () => {
    const errors: FieldErrors = {};
    const first = nameValidator.safeParse(firstName.trim());
    if (!first.success) errors.firstName = first.error.issues[0].message;

    const last = nameValidator.safeParse(lastName.trim());
    if (!last.success) errors.lastName = last.error.issues[0].message;

    const mail = emailValidator.safeParse(email.trim());
    if (!mail.success) errors.email = mail.error.issues[0].message;

    const pass = passwordValidator.safeParse(password);
    if (!pass.success) errors.password = pass.error.issues[0].message;

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleRegister = () => {
    if (!validate()) return;
    register.mutate(
      {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
        password,
      },
      // A new account is never onboarded, so go straight into the flow.
      { onSuccess: () => router.replace('/(onboarding)/gender') },
    );
  };

  return (
    <KeyboardAvoidingWrapper>
      <ScreenContainer style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('auth.register.heading')}</Text>
          <Text style={styles.subtitle}>{t('auth.register.tagline')}</Text>
        </View>

        {register.isError && (
          <View style={styles.errorBanner}>
            <AlertCircle size={18} color={theme.colors.error} />
            <Text style={styles.errorBannerText}>
              {getApiErrorMessage(register.error, 'Could not create your account.')}
            </Text>
          </View>
        )}

        <View style={styles.form}>
          <View style={styles.row}>
            <View style={styles.rowItem}>
              <Input
                label={t('auth.register.firstName')}
                placeholder={t('auth.register.firstPlaceholder')}
                value={firstName}
                onChangeText={(value) => {
                  setFirstName(value);
                  clearError('firstName');
                }}
                error={fieldErrors.firstName}
                autoComplete="given-name"
                leftIcon={<User color={theme.colors.textSecondary} size={20} />}
              />
            </View>
            <View style={styles.rowItem}>
              <Input
                label={t('auth.register.lastName')}
                placeholder={t('auth.register.lastPlaceholder')}
                value={lastName}
                onChangeText={(value) => {
                  setLastName(value);
                  clearError('lastName');
                }}
                error={fieldErrors.lastName}
                autoComplete="family-name"
              />
            </View>
          </View>

          <Input
            label={t('auth.login.email')}
            placeholder={t('auth.register.emailPlaceholder')}
            value={email}
            onChangeText={(value) => {
              setEmail(value);
              clearError('email');
            }}
            error={fieldErrors.email}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            leftIcon={<Mail color={theme.colors.textSecondary} size={20} />}
          />
          <Input
            label={t('auth.login.password')}
            placeholder={t('auth.register.passwordPlaceholder')}
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              clearError('password');
            }}
            error={fieldErrors.password}
            secureTextEntry
            autoComplete="new-password"
            returnKeyType="go"
            onSubmitEditing={handleRegister}
            leftIcon={<Lock color={theme.colors.textSecondary} size={20} />}
          />

          <Button
            title={t('auth.register.heading')}
            onPress={handleRegister}
            loading={register.isPending}
            style={styles.submitButton}
          />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>{t('auth.register.haveAccount')} </Text>
          <Link href="/(auth)/login" asChild>
            <Pressable hitSlop={8}>
              <Text style={styles.footerLink}>{t('auth.login.signIn')}</Text>
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
    marginTop: theme.spacing['2xl'],
  },
  title: {
    ...theme.typography.displayLg,
    color: theme.colors.text,
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
  row: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  rowItem: {
    flex: 1,
  },
  submitButton: {
    marginTop: theme.spacing.lg,
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
