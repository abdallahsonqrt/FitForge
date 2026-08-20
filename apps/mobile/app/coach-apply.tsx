import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { router } from 'expo-router';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { AlertCircle, BadgeCheck, Clock, FileText, XCircle } from 'lucide-react-native';
import { z } from 'zod';
import { KeyboardAvoidingWrapper } from '../src/components/layout/KeyboardAvoidingWrapper';
import { ScreenContainer } from '../src/components/layout/ScreenContainer';
import { Button, ErrorState, Input, Skeleton } from '../src/components/ui';
import {
  useApplyAsCoach,
  useCoachApplication,
} from '../src/features/coaching/api/useCoachApplication';
import { getApiErrorMessage } from '../src/lib/api';
import { COACH_HOME } from '../src/lib/routing';
import { useTranslation } from '../src/i18n';

const headlineValidator = z.string().min(1).max(255);

type FieldErrors = Partial<Record<'headline', string>>;

/**
 * Apply to become a coach, and the status of an application already sent.
 *
 * One screen for both because they are the same thing at different points in its
 * life, and an applicant who lands here after applying needs an answer, not the
 * form again.
 */
export default function CoachApplyScreen() {
  const { styles, theme } = useStyles(stylesheet);
  const { t } = useTranslation();

  const application = useCoachApplication();
  const apply = useApplyAsCoach();

  const [headline, setHeadline] = useState('');
  const [bio, setBio] = useState('');
  const [years, setYears] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const clearError = (field: keyof FieldErrors) =>
    setFieldErrors((prev) => ({ ...prev, [field]: undefined }));

  const validate = () => {
    const errors: FieldErrors = {};
    if (!headlineValidator.safeParse(headline.trim()).success) {
      errors.headline = t('coach.apply.headlineRequired');
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    const parsedYears = Number.parseInt(years, 10);
    apply.mutate({
      headline: headline.trim(),
      bio: bio.trim() || undefined,
      // The API takes 0–80; anything unparseable is simply omitted.
      yearsExperience: Number.isFinite(parsedYears) ? parsedYears : undefined,
    });
  };

  const status = application.data?.verificationStatus;

  const renderStatus = (
    icon: React.ReactNode,
    title: string,
    body: string,
    action?: { label: string; onPress: () => void },
  ) => (
    <View style={styles.statusCard}>
      <View style={styles.statusIcon}>{icon}</View>
      <Text style={styles.statusTitle} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.statusBody}>{body}</Text>
      {action ? (
        <Button title={action.label} onPress={action.onPress} style={styles.statusAction} />
      ) : null}
    </View>
  );

  const renderBody = () => {
    if (application.isLoading) {
      return (
        <View style={styles.loading}>
          <Skeleton height={140} borderRadius={theme.borderRadius.lg} />
          <Skeleton height={56} borderRadius={theme.borderRadius.md} />
          <Skeleton height={56} borderRadius={theme.borderRadius.md} />
        </View>
      );
    }

    if (application.isError) {
      return (
        <ErrorState
          message={getApiErrorMessage(application.error, t('coach.apply.loadFailed'))}
          onRetry={() => application.refetch()}
        />
      );
    }

    if (status === 'pending') {
      return renderStatus(
        <Clock size={28} color={theme.colors.warning} />,
        t('coach.apply.pendingTitle'),
        t('coach.apply.pendingBody'),
      );
    }

    if (status === 'rejected') {
      return renderStatus(
        <XCircle size={28} color={theme.colors.error} />,
        t('coach.apply.rejectedTitle'),
        t('coach.apply.rejectedBody'),
      );
    }

    if (status === 'verified') {
      return renderStatus(
        <BadgeCheck size={28} color={theme.colors.success} />,
        t('coach.apply.verifiedTitle'),
        t('coach.apply.verifiedBody'),
        { label: t('coach.apply.openWorkspace'), onPress: () => router.replace(COACH_HOME) },
      );
    }

    return (
      <>
        {apply.isError ? (
          <View style={styles.errorBanner}>
            <AlertCircle size={18} color={theme.colors.error} />
            <Text style={styles.errorBannerText}>
              {getApiErrorMessage(apply.error, t('coach.apply.submitFailed'))}
            </Text>
          </View>
        ) : null}

        <Input
          label={t('coach.apply.headline')}
          placeholder={t('coach.apply.headlinePlaceholder')}
          value={headline}
          onChangeText={(value) => {
            setHeadline(value);
            clearError('headline');
          }}
          error={fieldErrors.headline}
          maxLength={255}
          leftIcon={<FileText color={theme.colors.textSecondary} size={20} />}
        />
        <Input
          label={t('coach.apply.bio')}
          placeholder={t('coach.apply.bioPlaceholder')}
          value={bio}
          onChangeText={setBio}
          multiline
          numberOfLines={4}
          maxLength={5000}
        />
        <Input
          label={t('coach.apply.experience')}
          value={years}
          onChangeText={setYears}
          keyboardType="number-pad"
          returnKeyType="go"
          onSubmitEditing={handleSubmit}
        />

        <Button
          title={t('coach.apply.submit')}
          onPress={handleSubmit}
          loading={apply.isPending}
          style={styles.submit}
        />
      </>
    );
  };

  return (
    <KeyboardAvoidingWrapper>
      <ScreenContainer>
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            {t('coach.apply.title')}
          </Text>
          <Text style={styles.subtitle}>{t('coach.apply.subtitle')}</Text>
        </View>
        {renderBody()}
      </ScreenContainer>
    </KeyboardAvoidingWrapper>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  header: { marginBottom: theme.spacing.xl },
  title: { ...theme.typography.displaySm, color: theme.colors.text },
  subtitle: {
    ...theme.typography.bodyMd,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  loading: { gap: theme.spacing.lg },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.errorSoft,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  errorBannerText: { ...theme.typography.bodySm, color: theme.colors.error, flex: 1 },
  submit: { marginTop: theme.spacing.md },
  statusCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.xl,
    gap: theme.spacing.sm,
  },
  statusIcon: {
    backgroundColor: theme.colors.primarySoft,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.full,
    marginBottom: theme.spacing.xs,
  },
  statusTitle: { ...theme.typography.headingLg, color: theme.colors.text, textAlign: 'center' },
  statusBody: {
    ...theme.typography.bodyMd,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  statusAction: { marginTop: theme.spacing.md, alignSelf: 'stretch' },
}));
