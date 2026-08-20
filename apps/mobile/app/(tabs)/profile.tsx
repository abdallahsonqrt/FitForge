import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import {
  ChevronRight,
  Settings,
  Bell,
  Palette,
  Globe,
  Ruler,
  Crown,
  GraduationCap,
  LogOut,
  Smartphone,
} from 'lucide-react-native';
import { ScreenContainer } from '../../src/components/layout/ScreenContainer';
import { getApiErrorMessage } from '../../src/lib/api';
import { Avatar, Badge, Button, ErrorState } from '../../src/components/ui';
import { useMe } from '../../src/features/users/api/useMe';
import { useLogout } from '../../src/features/auth/api/useLogout';
import { useEntitlements } from '../../src/features/subscription/api/useSubscription';
import { languageLabel, usePreferencesStore } from '../../src/store/preferencesStore';
import { displayName } from '../../src/features/users/types';
import { showAlert } from '../../src/lib/alert';
import { useTranslation } from '../../src/i18n';

export default function ProfileScreen() {
  const { styles, theme } = useStyles(stylesheet);
  const { t } = useTranslation();

  const me = useMe();
  const entitlements = useEntitlements();
  const logout = useLogout();
  const { language, units, theme: themePreference } = usePreferencesStore();

  // The plan's own name, so a legacy `elite` subscriber sees the tier they hold
  // rather than the raw enum value.
  const planName = entitlements.planName;
  const name = displayName(me.data);

  const confirmLogout = () => {
    showAlert(t('profile.logOutTitle'), t('profile.logOutMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('profile.logOutTitle'),
        style: 'destructive',
        // Where signing out lands is `useSessionEndedRedirect`'s call, so that a
        // session ending here and a session expiring on its own agree.
        onPress: () => logout.mutate(),
      },
    ]);
  };

  const renderMenuItem = (
    icon: React.ReactNode,
    title: string,
    onPress: () => void,
    rightElement?: React.ReactNode,
    isLast = false,
  ) => (
    <Pressable
      style={({ pressed }) => [styles.menuItem, isLast && styles.menuItemLast, pressed && styles.menuItemPressed]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <View style={styles.menuIconContainer}>{icon}</View>
      <Text style={styles.menuTitle}>{title}</Text>
      <View style={styles.menuRight}>
        {rightElement}
        <ChevronRight size={20} color={theme.colors.textSecondary} />
      </View>
    </Pressable>
  );

  // The profile is entirely `me`; without this a failed load rendered an
  // avatar with a blank name and no indication anything had gone wrong.
  if (me.isError) {
    return (
      <ScreenContainer insideTabs onRefresh={() => me.refetch()} refreshing={me.isFetching}>
        <ErrorState
          message={getApiErrorMessage(me.error, t('common.somethingWentWrong'))}
          onRetry={() => me.refetch()}
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer insideTabs onRefresh={() => me.refetch()} refreshing={me.isFetching}>
      <View style={styles.profileHeader}>
        <Avatar name={name || '?'} url={me.data?.avatarUrl ?? undefined} size={80} style={styles.avatar} />
        <Text style={styles.name}>{name || 'Your profile'}</Text>
        <Text style={styles.email}>{me.data?.email ?? ''}</Text>
        <View style={styles.tierContainer}>
          <Badge
            label={`${planName.toUpperCase()} PLAN`}
            variant={entitlements.canonicalTier === 'free' ? 'default' : 'premium'}
          />
        </View>
      </View>

      <View style={styles.menuSection}>
        <Text style={styles.sectionTitle}>{t('profile.account')}</Text>
        {renderMenuItem(
          <Settings size={20} color={theme.colors.textSecondary} />,
          t('profile.account'),
          () => router.push('/settings/account'),
        )}
        {renderMenuItem(
          <Smartphone size={20} color={theme.colors.textSecondary} />,
          t('profile.devices'),
          () => router.push('/settings/devices'),
        )}
        {renderMenuItem(
          <Crown size={20} color={theme.colors.warning} />,
          t('profile.subscription'),
          () => router.push('/subscription'),
          <Text style={styles.menuValue}>{planName}</Text>,
        )}
        {/*
          The way in to coaching. The screen itself reports an application that is
          already under review, so it stays visible after applying rather than
          vanishing and leaving the applicant with nowhere to check.
        */}
        {renderMenuItem(
          <GraduationCap size={20} color={theme.colors.primary} />,
          t('coach.apply.entry'),
          () => router.push('/coach-apply'),
          undefined,
          true,
        )}
      </View>

      <View style={styles.menuSection}>
        <Text style={styles.sectionTitle}>{t('profile.settings')}</Text>
        {renderMenuItem(
          <Palette size={20} color={theme.colors.textSecondary} />,
          t('profile.appearance'),
          () => router.push('/settings/theme'),
          <Text style={styles.menuValue}>{themePreference}</Text>,
        )}
        {renderMenuItem(
          <Bell size={20} color={theme.colors.textSecondary} />,
          t('profile.notifications'),
          () => router.push('/settings/notifications'),
        )}
        {renderMenuItem(
          <Globe size={20} color={theme.colors.textSecondary} />,
          t('profile.language'),
          () => router.push('/settings/language'),
          <Text style={styles.menuValue}>{languageLabel(language)}</Text>,
        )}
        {renderMenuItem(
          <Ruler size={20} color={theme.colors.textSecondary} />,
          t('profile.units'),
          () => router.push('/settings/units'),
          <Text style={styles.menuValue}>{units}</Text>,
          true,
        )}
      </View>

      <Button
        title={t('profile.logOut')}
        variant="ghost"
        icon={<LogOut size={20} color={theme.colors.error} />}
        onPress={confirmLogout}
        loading={logout.isPending}
        textStyle={{ color: theme.colors.error }}
        style={styles.logoutButton}
      />
    </ScreenContainer>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  profileHeader: {
    alignItems: 'center',
    marginBottom: theme.spacing['2xl'],
    paddingTop: theme.spacing.xl,
  },
  avatar: {
    marginBottom: theme.spacing.md,
  },
  name: {
    ...theme.typography.headingLg,
    color: theme.colors.text,
  },
  email: {
    ...theme.typography.bodyMd,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  tierContainer: {
    marginTop: theme.spacing.xs,
  },
  menuSection: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.lg,
    overflow: 'hidden',
  },
  sectionTitle: {
    ...theme.typography.labelSm,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.xs,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  menuItemPressed: {
    backgroundColor: theme.colors.surfaceElevated,
  },
  menuIconContainer: {
    width: 32,
    alignItems: 'center',
    marginRight: theme.spacing.sm,
  },
  menuTitle: {
    ...theme.typography.bodyLg,
    color: theme.colors.text,
    flex: 1,
  },
  menuRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  menuValue: {
    ...theme.typography.bodySm,
    color: theme.colors.textSecondary,
    textTransform: 'capitalize',
  },
  logoutButton: {
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing['3xl'],
  },
}));
