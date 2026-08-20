import React from 'react';
import { View, Text, Switch, Pressable } from 'react-native';
import { ScreenContainer } from '../../src/components/layout/ScreenContainer';
import { useTranslation } from '../../src/i18n';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { BellOff } from 'lucide-react-native';
import { Skeleton } from '../../src/components/ui';
import {
  NOTIFICATION_CHANNELS,
  useNotificationPrefsStore,
} from '../../src/store/notificationPrefsStore';
import {
  useMarkNotificationRead,
  useNotifications,
} from '../../src/features/notifications/api/useNotifications';
import { relativeDayLabel } from '../../src/utils/date';

export default function NotificationsScreen() {
  const { styles, theme } = useStyles(stylesheet);
  const { t } = useTranslation();
  const channels = useNotificationPrefsStore((state) => state.channels);
  const toggle = useNotificationPrefsStore((state) => state.toggle);

  const notifications = useNotifications();
  const markRead = useMarkNotificationRead();

  return (
    <ScreenContainer contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>{t('settings.notifications.push')}</Text>
      <View style={styles.list}>
        {NOTIFICATION_CHANNELS.map((channel, index) => (
          <View
            key={channel.key}
            style={[styles.row, index === NOTIFICATION_CHANNELS.length - 1 && styles.rowLast]}
          >
            <View style={styles.rowInfo}>
              <Text style={styles.rowTitle}>{channel.title}</Text>
              <Text style={styles.rowSubtitle}>{channel.subtitle}</Text>
            </View>
            <Switch
              value={channels[channel.key]}
              onValueChange={() => toggle(channel.key)}
              trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
              accessibilityLabel={channel.title}
            />
          </View>
        ))}
      </View>
      <Text style={styles.footnote}>These preferences are stored on this device.</Text>

      <Text style={styles.sectionTitle}>Inbox</Text>
      {notifications.isLoading ? (
        <Skeleton height={120} />
      ) : (notifications.data ?? []).length === 0 ? (
        <View style={styles.emptyCard}>
          <BellOff size={24} color={theme.colors.textSecondary} />
          <Text style={styles.emptyText}>No notifications yet.</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {(notifications.data ?? []).map((notification, index, all) => (
            <Pressable
              key={notification.id}
              style={[styles.row, index === all.length - 1 && styles.rowLast]}
              onPress={() => !notification.isRead && markRead.mutate(notification.id)}
              accessibilityRole="button"
            >
              <View style={styles.rowInfo}>
                <View style={styles.notificationHeader}>
                  {!notification.isRead && <View style={styles.unreadDot} />}
                  <Text style={styles.rowTitle}>{notification.title}</Text>
                </View>
                <Text style={styles.rowSubtitle}>{notification.body}</Text>
              </View>
              <Text style={styles.timestamp}>{relativeDayLabel(notification.createdAt)}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </ScreenContainer>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  content: { paddingBottom: theme.spacing['3xl'] },
  sectionTitle: {
    color: theme.colors.textSecondary,
    ...theme.typography.labelSm,
    textTransform: 'uppercase',
    marginBottom: theme.spacing.sm,
    marginTop: theme.spacing.lg,
  },
  list: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    gap: theme.spacing.md,
  },
  rowLast: { borderBottomWidth: 0 },
  rowInfo: { flex: 1 },
  rowTitle: { color: theme.colors.text, ...theme.typography.labelMd },
  rowSubtitle: { color: theme.colors.textSecondary, ...theme.typography.bodySm, marginTop: 2 },
  notificationHeader: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.primary,
  },
  timestamp: { color: theme.colors.textSecondary, ...theme.typography.bodyXs },
  footnote: {
    color: theme.colors.textSecondary,
    ...theme.typography.bodyXs,
    marginTop: theme.spacing.sm,
  },
  emptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
  },
  emptyText: { color: theme.colors.textSecondary, ...theme.typography.bodySm },
}));
