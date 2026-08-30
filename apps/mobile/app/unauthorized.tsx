import React from 'react';
import { View, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { ShieldAlert } from 'lucide-react-native';
import { ScreenContainer } from '../src/components/layout/ScreenContainer';
import { Button } from '../src/components/ui';
import { useLogout } from '../src/features/auth/api/useLogout';
import { useAuthStore } from '../src/store/authStore';
import { goBack } from '../src/lib/navigation';
import { homeHrefFor } from '../src/lib/routing';
import { useTranslation } from '../src/i18n';

/**
 * Shown when a signed-in account opens a page that belongs to a different kind
 * of account.
 *
 * The guards used to redirect silently to the user's own home, which is
 * indistinguishable from the link being broken: the page simply never appeared
 * and nothing said why. Saying so plainly — and offering the account switch that
 * would actually fix it — turns a dead end into a recoverable one.
 */
export default function UnauthorizedScreen() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { styles, theme } = useStyles(stylesheet);
  const { t } = useTranslation();

  const user = useAuthStore((state) => state.user);
  const onboarded = useAuthStore((state) => state.isOnboarded);
  const logout = useLogout();

  const home = homeHrefFor(user, onboarded);

  /**
   * Sign out, then return to sign-in carrying the page they wanted. If the next
   * account may open it they land there directly; if not, they land on their own
   * home — never back here.
   */
  /**
   * Sign out *as an account switch*, which is what sends the app to sign-in
   * carrying `next` rather than to the landing page. Navigation is left entirely
   * to `useSessionEndedRedirect`, so there is one place deciding it.
   */
  const switchAccount = () => {
    logout.mutate({ kind: 'switching', intended: next });
  };

  return (
    <ScreenContainer style={styles.container}>
      <View style={styles.icon}>
        <ShieldAlert size={36} color={theme.colors.warning} />
      </View>

      <Text style={styles.title} accessibilityRole="header">
        {t('unauthorized.title')}
      </Text>
      <Text style={styles.body}>{t('unauthorized.body')}</Text>

      {next ? (
        <View style={styles.pathBox}>
          <Text style={styles.pathLabel}>{t('unauthorized.requestedPage')}</Text>
          <Text style={styles.path} numberOfLines={2}>
            {next}
          </Text>
        </View>
      ) : null}

      <Button
        title={t('unauthorized.goBack')}
        onPress={() => goBack(home)}
        style={styles.action}
      />
      <Button
        title={t('unauthorized.switchAccount')}
        variant="outline"
        loading={logout.isPending}
        onPress={switchAccount}
        style={styles.action}
      />
    </ScreenContainer>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  container: { justifyContent: 'center' },
  icon: {
    alignSelf: 'center',
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.warningSoft,
    marginBottom: theme.spacing.lg,
  },
  title: {
    ...theme.typography.headingLg,
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  body: {
    ...theme.typography.bodyMd,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.xl,
  },
  pathBox: {
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.xl,
  },
  pathLabel: {
    ...theme.typography.labelSm,
    color: theme.colors.textSecondary,
    marginBottom: 2,
  },
  path: { ...theme.typography.bodySm, color: theme.colors.text },
  action: { marginBottom: theme.spacing.sm },
}));
