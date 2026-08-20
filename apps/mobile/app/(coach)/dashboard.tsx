import React from 'react';
import { View, Text, Pressable, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { Dumbbell, Inbox, Plus, UserCircle, Users } from 'lucide-react-native';
import { ScreenContainer } from '../../src/components/layout/ScreenContainer';
import { EmptyState, ErrorState, Skeleton } from '../../src/components/ui';
import { useCoachDashboard } from '../../src/features/coaching/api/useCoachDashboard';
import { getApiErrorMessage } from '../../src/lib/api';
import { useAuthStore } from '../../src/store/authStore';
import { useTranslation, type TranslationKey } from '../../src/i18n';

/** Below this the tiles go two-up; above, all four fit on one row. */
const WIDE_BREAKPOINT = 600;

/** Every tap target on this screen, tiles included, clears the 44pt minimum. */
const MIN_TAP_TARGET = 44;

/** Tall enough for a number over a label without the label wrapping at 320pt. */
const TILE_HEIGHT = 104;

type TileTone = 'primary' | 'secondary' | 'success' | 'warning';

interface Tile {
  id: string;
  labelKey: TranslationKey;
  value: number;
  tone: TileTone;
  href: Parameters<typeof router.push>[0];
}

interface QuickAction {
  id: string;
  labelKey: TranslationKey;
  icon: React.ReactNode;
  onPress: () => void;
}

export default function CoachDashboardScreen() {
  const { styles, theme } = useStyles(stylesheet);
  const { t } = useTranslation();
  const { width } = useWindowDimensions();

  // The greeting comes from the account, not the coach profile: `firstName` is
  // null on the coach row for most accounts, and "Welcome back, null" is worse
  // than no name at all.
  const firstName = useAuthStore((state) => state.user?.firstName ?? null);
  const email = useAuthStore((state) => state.user?.email ?? '');

  const dashboard = useCoachDashboard();
  const summary = dashboard.data;

  const greetingName = firstName?.trim() || email.split('@')[0] || t('coach.tabs.dashboard');

  const goTo = (href: Parameters<typeof router.push>[0]) => () => router.push(href);

  const quickActions: QuickAction[] = [
    {
      id: 'new-program',
      labelKey: 'coach.dashboard.newProgram',
      icon: <Plus size={22} color={theme.colors.primary} />,
      onPress: goTo('/(coach)/programs'),
    },
    {
      id: 'view-clients',
      labelKey: 'coach.dashboard.viewClients',
      icon: <Users size={22} color={theme.colors.secondary} />,
      onPress: goTo('/(coach)/clients'),
    },
    {
      id: 'open-inbox',
      labelKey: 'coach.dashboard.openInbox',
      icon: <Inbox size={22} color={theme.colors.success} />,
      onPress: goTo('/(coach)/messages'),
    },
    {
      id: 'edit-profile',
      labelKey: 'coach.dashboard.editProfile',
      icon: <UserCircle size={22} color={theme.colors.warning} />,
      onPress: goTo('/(coach)/profile'),
    },
  ];

  const tiles: Tile[] = summary
    ? [
        {
          id: 'active-clients',
          labelKey: 'coach.dashboard.activeClients',
          value: summary.activeClients,
          tone: 'primary',
          href: '/(coach)/clients',
        },
        {
          id: 'programs',
          labelKey: 'coach.dashboard.programs',
          value: summary.programs,
          tone: 'secondary',
          href: '/(coach)/programs',
        },
        {
          id: 'unread',
          labelKey: 'coach.dashboard.unread',
          value: summary.unreadMessages,
          tone: 'success',
          href: '/(coach)/messages',
        },
        {
          id: 'pending',
          labelKey: 'coach.dashboard.pendingRequests',
          value: summary.pendingRequests,
          tone: 'warning',
          href: '/(coach)/clients',
        },
      ]
    : [];

  const tileBasis = width >= WIDE_BREAKPOINT ? '22%' : '44%';

  const renderBody = () => {
    if (dashboard.isLoading) {
      return (
        <View testID="coach-dashboard-loading">
          <View style={styles.tileGrid}>
            {[0, 1, 2, 3].map((index) => (
              <Skeleton
                key={index}
                height={TILE_HEIGHT}
                borderRadius={theme.borderRadius.lg}
                style={{ flexGrow: 1, flexBasis: tileBasis }}
              />
            ))}
          </View>
          <Skeleton height={20} width={140} style={styles.skeletonHeading} />
          <View style={styles.tileGrid}>
            {[0, 1, 2, 3].map((index) => (
              <Skeleton
                key={index}
                height={TILE_HEIGHT}
                borderRadius={theme.borderRadius.lg}
                style={{ flexGrow: 1, flexBasis: tileBasis }}
              />
            ))}
          </View>
        </View>
      );
    }

    if (dashboard.isError) {
      return (
        <ErrorState
          message={getApiErrorMessage(dashboard.error, t('coach.dashboard.loadFailed'))}
          onRetry={() => dashboard.refetch()}
        />
      );
    }

    return (
      <>
        {summary?.isNewCoach ? (
          <EmptyState
            icon={<Dumbbell size={32} color={theme.colors.primary} />}
            title={t('coach.dashboard.emptyTitle')}
            description={t('coach.dashboard.emptyBody')}
            actionLabel={t('coach.dashboard.newProgram')}
            onAction={goTo('/(coach)/programs')}
            style={styles.emptyState}
          />
        ) : (
          <View style={styles.tileGrid} testID="coach-dashboard-stats">
            {tiles.map((tile) => (
              <Pressable
                key={tile.id}
                testID={`coach-stat-${tile.id}`}
                onPress={goTo(tile.href)}
                accessibilityRole="button"
                accessibilityLabel={`${t(tile.labelKey)}: ${tile.value}`}
                style={({ pressed }) => [
                  styles.tile,
                  { flexBasis: tileBasis },
                  pressed && styles.tilePressed,
                ]}
              >
                {/* One colour lookup, so the sheet stays free of variant functions. */}
                <View style={[styles.toneDot, { backgroundColor: theme.colors[tile.tone] }]} />
                <Text style={styles.tileValue}>{tile.value}</Text>
                <Text style={styles.tileLabel}>{t(tile.labelKey)}</Text>
              </Pressable>
            ))}
          </View>
        )}

        <Text style={styles.sectionTitle} accessibilityRole="header">
          {t('coach.dashboard.quickActions')}
        </Text>

        <View style={styles.tileGrid}>
          {quickActions.map((action) => (
            <Pressable
              key={action.id}
              testID={`coach-action-${action.id}`}
              onPress={action.onPress}
              accessibilityRole="button"
              accessibilityLabel={t(action.labelKey)}
              style={({ pressed }) => [
                styles.action,
                { flexBasis: tileBasis },
                pressed && styles.tilePressed,
              ]}
            >
              <View style={styles.actionIcon}>{action.icon}</View>
              <Text style={styles.actionLabel}>{t(action.labelKey)}</Text>
            </Pressable>
          ))}
        </View>
      </>
    );
  };

  return (
    <ScreenContainer
      insideTabs
      onRefresh={() => dashboard.refetch()}
      refreshing={dashboard.isFetching && !dashboard.isLoading}
    >
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>
          {t('coach.dashboard.greeting', { name: greetingName })}
        </Text>
        <Text style={styles.subtitle}>
          {new Date().toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}
        </Text>
      </View>

      {renderBody()}
    </ScreenContainer>
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
  sectionTitle: {
    ...theme.typography.headingLg,
    color: theme.colors.text,
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.md,
  },
  skeletonHeading: {
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.md,
  },
  // `gap` rather than margins: the whole grid mirrors cleanly under RTL.
  tileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  tile: {
    flexGrow: 1,
    minHeight: TILE_HEIGHT,
    minWidth: MIN_TAP_TARGET,
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
  },
  tilePressed: {
    backgroundColor: theme.colors.surfaceElevated,
    opacity: 0.94,
  },
  toneDot: {
    width: 8,
    height: 8,
    borderRadius: theme.borderRadius.full,
    marginBottom: theme.spacing.sm,
  },
  tileValue: {
    ...theme.typography.numeric,
    color: theme.colors.text,
  },
  tileLabel: {
    ...theme.typography.bodySm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  action: {
    flexGrow: 1,
    minHeight: TILE_HEIGHT,
    minWidth: MIN_TAP_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  actionIcon: {
    backgroundColor: theme.colors.primarySoft,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.full,
  },
  actionLabel: {
    ...theme.typography.labelSm,
    color: theme.colors.text,
    textAlign: 'center',
  },
  emptyState: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
}));
