import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { UserX } from 'lucide-react-native';
import { ScreenContainer } from '../../../src/components/layout/ScreenContainer';
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  SkeletonList,
} from '../../../src/components/ui';
import {
  allowedTransitions,
  useCoachClient,
  useUpdateEnrollment,
} from '../../../src/features/coaching/api/useCoachClients';
import { useConversations } from '../../../src/features/coaching/api/useConversations';
import type { EnrollmentStatus } from '../../../src/features/coaching/types';
import type { ExperienceLevel, FitnessGoal } from '../../../src/features/users/types';
import { getApiErrorMessage } from '../../../src/lib/api';
import { showAlert } from '../../../src/lib/alert';
import { useTranslation, type TranslationKey } from '../../../src/i18n';

const STATUS_LABEL: Record<EnrollmentStatus, TranslationKey> = {
  pending: 'coach.clients.pending',
  active: 'coach.clients.active',
  paused: 'coach.clients.paused',
  completed: 'coach.clients.completed',
  canceled: 'coach.clients.canceled',
};

const STATUS_VARIANT: Record<EnrollmentStatus, 'default' | 'success' | 'warning'> = {
  pending: 'warning',
  active: 'success',
  paused: 'warning',
  completed: 'default',
  canceled: 'default',
};

const TRANSITION_LABEL: Record<EnrollmentStatus, TranslationKey> = {
  active: 'coach.clients.accept',
  canceled: 'coach.clients.decline',
  paused: 'coach.clients.pause',
  completed: 'coach.clients.completed',
  pending: 'coach.clients.pending',
};

/** Reuses the onboarding copy the athlete themselves chose from. */
const GOAL_LABEL: Record<FitnessGoal, TranslationKey> = {
  weight_loss: 'onboarding.goal.loseWeight',
  muscle_gain: 'onboarding.goal.buildMuscle',
  maintenance: 'onboarding.goal.keepFit',
  endurance: 'onboarding.goal.endurance',
};

const LEVEL_LABEL: Record<ExperienceLevel, TranslationKey> = {
  beginner: 'onboarding.experience.beginner',
  intermediate: 'onboarding.experience.intermediate',
  advanced: 'onboarding.experience.advanced',
};

export default function CoachClientDetailScreen() {
  const { enrollmentId } = useLocalSearchParams<{ enrollmentId: string }>();
  const { styles, theme } = useStyles(stylesheet);
  const { t } = useTranslation();

  const client = useCoachClient(enrollmentId);
  const conversations = useConversations();
  const updateEnrollment = useUpdateEnrollment();

  /**
   * A coach cannot open a thread: `POST /conversations` resolves the caller as
   * the athlete side, so the button only appears once the athlete has written
   * first and a thread exists.
   */
  const conversation = useMemo(
    () =>
      (conversations.data ?? []).find(
        (item) => item.athleteUserId === client.data?.athleteUserId,
      ),
    [conversations.data, client.data],
  );

  const name = useMemo(() => {
    const athlete = client.data?.athlete;
    if (!athlete) return '';
    return [athlete.firstName, athlete.lastName].filter(Boolean).join(' ').trim() || 'Athlete';
  }, [client.data]);

  const labelFor = (from: EnrollmentStatus, to: EnrollmentStatus): TranslationKey =>
    to === 'active' && from === 'paused' ? 'coach.clients.resume' : TRANSITION_LABEL[to];

  const applyTransition = (to: EnrollmentStatus) => {
    if (!client.data) return;
    const from = client.data.status;

    const run = () =>
      updateEnrollment.mutate(
        { enrollmentId: client.data!.id, status: to },
        {
          onError: (error) =>
            showAlert(
              t('coach.clients.statusFailed'),
              getApiErrorMessage(error, t('coach.clients.statusFailed')),
            ),
        },
      );

    if (to === 'canceled') {
      showAlert(t(labelFor(from, to)), name, [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t(labelFor(from, to)), style: 'destructive', onPress: run },
      ]);
      return;
    }
    run();
  };

  if (client.isLoading) {
    return (
      <ScreenContainer>
        <SkeletonList count={4} height={96} />
      </ScreenContainer>
    );
  }

  if (client.isError) {
    return (
      <ScreenContainer>
        <ErrorState
          message={getApiErrorMessage(client.error, t('coach.clients.loadFailed'))}
          onRetry={() => client.refetch()}
        />
      </ScreenContainer>
    );
  }

  // `useCoachClient` resolves to null when the id matches no row on the roster.
  if (!client.data) {
    return (
      <ScreenContainer>
        <EmptyState
          icon={<UserX size={32} color={theme.colors.primary} />}
          title={t('coach.clients.emptyTitle')}
          description={t('coach.clients.emptyBody')}
          actionLabel={t('common.back')}
          onAction={() => router.replace('/(coach)/clients')}
        />
      </ScreenContainer>
    );
  }

  const enrollment = client.data;
  const athlete = enrollment.athlete;
  const transitions = allowedTransitions(enrollment.status);
  const equipment = athlete.availableEquipment ?? [];

  return (
    <ScreenContainer onRefresh={() => client.refetch()} refreshing={client.isFetching}>
      <View style={styles.identity}>
        <Avatar url={athlete.avatarUrl ?? undefined} name={name} size={64} />
        <View style={styles.identityText}>
          <Text style={styles.name} accessibilityRole="header">
            {name}
          </Text>
          {athlete.sport ? <Text style={styles.sport}>{athlete.sport}</Text> : null}
        </View>
        <Badge
          label={t(STATUS_LABEL[enrollment.status])}
          variant={STATUS_VARIANT[enrollment.status]}
        />
      </View>

      {conversation && (
        <Button
          title={t('coach.clients.message')}
          variant="outline"
          onPress={() => router.push(`/coach/conversation/${conversation.id}`)}
          style={styles.messageButton}
        />
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('coach.clients.assignedProgram')}</Text>
        <Text style={styles.cardValue}>
          {enrollment.program?.name ?? t('coach.clients.noProgram')}
        </Text>
        {enrollment.currentWeek != null && (
          <Text style={styles.cardMeta}>
            {t('coach.clients.currentWeek', { number: enrollment.currentWeek })}
          </Text>
        )}
      </View>

      <View style={styles.card}>
        <View style={styles.factRow}>
          <Text style={styles.factLabel}>{t('coach.clients.goal')}</Text>
          <Text style={styles.factValue}>
            {athlete.fitnessGoal ? t(GOAL_LABEL[athlete.fitnessGoal]) : '—'}
          </Text>
        </View>
        <View style={styles.factRow}>
          <Text style={styles.factLabel}>{t('coach.clients.level')}</Text>
          <Text style={styles.factValue}>
            {athlete.experienceLevel ? t(LEVEL_LABEL[athlete.experienceLevel]) : '—'}
          </Text>
        </View>
        <View style={styles.factRow}>
          <Text style={styles.factLabel}>{t('coach.clients.equipment')}</Text>
          <Text style={styles.factValue} numberOfLines={2}>
            {equipment.length > 0 ? equipment.join(', ') : '—'}
          </Text>
        </View>
      </View>

      {transitions.length > 0 && (
        <View style={styles.actions}>
          {transitions.map((to) => (
            <Button
              key={to}
              title={t(labelFor(enrollment.status, to))}
              variant={to === 'canceled' ? 'outline' : 'primary'}
              loading={updateEnrollment.isPending}
              onPress={() => applyTransition(to)}
              style={styles.action}
            />
          ))}
        </View>
      )}
    </ScreenContainer>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  identityText: { flex: 1 },
  name: { ...theme.typography.headingLg, color: theme.colors.text },
  sport: {
    ...theme.typography.bodySm,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  messageButton: { marginBottom: theme.spacing.lg },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  cardTitle: {
    ...theme.typography.labelSm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  cardValue: { ...theme.typography.bodyMd, color: theme.colors.text },
  cardMeta: {
    ...theme.typography.bodySm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  factRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  factLabel: { ...theme.typography.bodySm, color: theme.colors.textSecondary },
  factValue: {
    ...theme.typography.bodySm,
    color: theme.colors.text,
    flexShrink: 1,
    textAlign: 'right',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  action: { flexGrow: 1, flexBasis: 140 },
}));
