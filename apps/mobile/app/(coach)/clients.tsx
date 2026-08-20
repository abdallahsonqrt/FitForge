import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { Users } from 'lucide-react-native';
import { ScreenContainer } from '../../src/components/layout/ScreenContainer';
import { Avatar, Badge, Button, Chip, EmptyState, ErrorState, SkeletonList } from '../../src/components/ui';
import {
  allowedTransitions,
  useCoachClients,
  useUpdateEnrollment,
} from '../../src/features/coaching/api/useCoachClients';
import type { CoachClient, EnrollmentStatus } from '../../src/features/coaching/types';
import { getApiErrorMessage } from '../../src/lib/api';
import { showAlert } from '../../src/lib/alert';
import { useTranslation, type TranslationKey } from '../../src/i18n';

const STATUSES: EnrollmentStatus[] = ['pending', 'active', 'paused', 'completed', 'canceled'];

type Filter = 'all' | EnrollmentStatus;

const STATUS_LABEL: Record<EnrollmentStatus, TranslationKey> = {
  pending: 'coach.clients.pending',
  active: 'coach.clients.active',
  paused: 'coach.clients.paused',
  completed: 'coach.clients.completed',
  canceled: 'coach.clients.canceled',
};

/** Which badge colour each status wears. Terminal states stay neutral. */
const STATUS_VARIANT: Record<EnrollmentStatus, 'default' | 'success' | 'warning'> = {
  pending: 'warning',
  active: 'success',
  paused: 'warning',
  completed: 'default',
  canceled: 'default',
};

/**
 * The verb shown on the button for a transition, rather than the name of the
 * state it lands in: a coach accepts a request, they do not "active" it.
 */
const TRANSITION_LABEL: Record<EnrollmentStatus, TranslationKey> = {
  active: 'coach.clients.accept',
  canceled: 'coach.clients.decline',
  paused: 'coach.clients.pause',
  completed: 'coach.clients.completed',
  pending: 'coach.clients.pending',
};

const displayName = (client: CoachClient): string =>
  [client.athlete.firstName, client.athlete.lastName].filter(Boolean).join(' ').trim() ||
  'Athlete';

export default function CoachClientsScreen() {
  const { styles, theme } = useStyles(stylesheet);
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Filter>('all');

  const clients = useCoachClients();
  const updateEnrollment = useUpdateEnrollment();

  const counts = useMemo(() => {
    const tally: Record<string, number> = { all: clients.data?.length ?? 0 };
    for (const status of STATUSES) {
      tally[status] = (clients.data ?? []).filter((c) => c.status === status).length;
    }
    return tally;
  }, [clients.data]);

  const visible = useMemo(
    () => (clients.data ?? []).filter((c) => filter === 'all' || c.status === filter),
    [clients.data, filter],
  );

  /**
   * `resume` and `accept` both land on `active`, so the label is chosen from
   * where the enrollment is coming *from*, not where it is going.
   */
  const labelFor = (from: EnrollmentStatus, to: EnrollmentStatus): TranslationKey =>
    to === 'active' && from === 'paused' ? 'coach.clients.resume' : TRANSITION_LABEL[to];

  const applyTransition = (client: CoachClient, to: EnrollmentStatus) => {
    const run = () =>
      updateEnrollment.mutate(
        { enrollmentId: client.id, status: to },
        {
          onError: (error) =>
            showAlert(
              t('coach.clients.statusFailed'),
              getApiErrorMessage(error, t('coach.clients.statusFailed')),
            ),
        },
      );

    // Declining and cancelling are terminal — the API allows no way back — so
    // they ask first. Accepting and pausing are reversible and fire directly.
    if (to === 'canceled') {
      showAlert(t(labelFor(client.status, to)), displayName(client), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t(labelFor(client.status, to)), style: 'destructive', onPress: run },
      ]);
      return;
    }
    run();
  };

  const renderBody = () => {
    if (clients.isLoading) return <SkeletonList count={5} height={116} />;

    if (clients.isError) {
      return (
        <ErrorState
          message={getApiErrorMessage(clients.error, t('coach.clients.loadFailed'))}
          onRetry={() => clients.refetch()}
        />
      );
    }

    if ((clients.data ?? []).length === 0) {
      return (
        <EmptyState
          icon={<Users size={32} color={theme.colors.primary} />}
          title={t('coach.clients.emptyTitle')}
          description={t('coach.clients.emptyBody')}
          actionLabel={t('coach.programs.new')}
          onAction={() => router.push('/(coach)/programs')}
        />
      );
    }

    // The roster is not empty, but this filter is.
    if (visible.length === 0) {
      return (
        <EmptyState
          icon={<Users size={32} color={theme.colors.primary} />}
          title={t(STATUS_LABEL[filter as EnrollmentStatus])}
          description={t('coach.clients.emptyBody')}
        />
      );
    }

    return visible.map((client) => {
      const name = displayName(client);
      const transitions = allowedTransitions(client.status);

      return (
        <Pressable
          key={client.id}
          testID={`coach-client-${client.id}`}
          onPress={() => router.push(`/coach/client/${client.id}`)}
          accessibilityRole="button"
          accessibilityLabel={`${name}, ${t(STATUS_LABEL[client.status])}`}
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        >
          <View style={styles.cardHeader}>
            <Avatar url={client.athlete.avatarUrl ?? undefined} name={name} size={44} />
            <View style={styles.cardHeading}>
              <Text style={styles.name} numberOfLines={1}>
                {name}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                {client.program?.name ?? t('coach.clients.noProgram')}
              </Text>
            </View>
            <Badge
              label={t(STATUS_LABEL[client.status])}
              variant={STATUS_VARIANT[client.status]}
            />
          </View>

          {client.currentWeek != null && (
            <Text style={styles.week}>
              {t('coach.clients.currentWeek', { number: client.currentWeek })}
            </Text>
          )}

          {transitions.length > 0 && (
            <View style={styles.actions}>
              {transitions.map((to) => (
                <Button
                  key={to}
                  title={t(labelFor(client.status, to))}
                  size="sm"
                  variant={to === 'canceled' ? 'outline' : 'primary'}
                  loading={updateEnrollment.isPending}
                  onPress={() => applyTransition(client, to)}
                  style={styles.action}
                />
              ))}
            </View>
          )}
        </Pressable>
      );
    });
  };

  return (
    <ScreenContainer
      insideTabs
      onRefresh={() => clients.refetch()}
      refreshing={clients.isFetching}
    >
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          {t('coach.clients.title')}
        </Text>
        <Text style={styles.subtitle}>{t('coach.clients.tagline')}</Text>
      </View>

      {(clients.data ?? []).length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
        >
          <Chip
            label={`${t('coach.programs.filterAll')} (${counts.all})`}
            selected={filter === 'all'}
            onPress={() => setFilter('all')}
          />
          {STATUSES.filter((status) => counts[status] > 0).map((status) => (
            <Chip
              key={status}
              label={`${t(STATUS_LABEL[status])} (${counts[status]})`}
              selected={filter === status}
              onPress={() => setFilter(status)}
            />
          ))}
        </ScrollView>
      )}

      {renderBody()}
    </ScreenContainer>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  header: { marginBottom: theme.spacing.lg },
  title: { ...theme.typography.displaySm, color: theme.colors.text },
  subtitle: {
    ...theme.typography.bodyMd,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  filters: {
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
    paddingRight: theme.spacing.lg,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  cardPressed: { opacity: 0.85 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  cardHeading: { flex: 1 },
  name: { ...theme.typography.headingSm, color: theme.colors.text },
  meta: {
    ...theme.typography.bodySm,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  week: {
    ...theme.typography.bodySm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  action: { flexGrow: 1, flexBasis: 120 },
}));
