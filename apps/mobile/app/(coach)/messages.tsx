import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { MessageSquare } from 'lucide-react-native';
import { ScreenContainer } from '../../src/components/layout/ScreenContainer';
import { Avatar, EmptyState, ErrorState, SkeletonList } from '../../src/components/ui';
import { useConversations } from '../../src/features/coaching/api/useConversations';
import type { Conversation } from '../../src/features/coaching/types';
import { getApiErrorMessage } from '../../src/lib/api';
import { relativeDayLabel } from '../../src/utils/date';
import { useTranslation } from '../../src/i18n';

const participantName = (conversation: Conversation): string =>
  [conversation.participant.firstName, conversation.participant.lastName]
    .filter(Boolean)
    .join(' ')
    .trim() || 'Athlete';

/**
 * The inbox line under a name. A thread with no messages yet is a real state —
 * the API opens one when an athlete enrols — so it gets its own copy rather than
 * an empty row.
 */
const preview = (conversation: Conversation, fallback: string): string => {
  const body = conversation.lastMessage?.body?.trim();
  return body && body.length > 0 ? body : fallback;
};

export default function CoachMessagesScreen() {
  const { styles, theme } = useStyles(stylesheet);
  const { t } = useTranslation();

  const conversations = useConversations();

  const renderBody = () => {
    if (conversations.isLoading) return <SkeletonList count={6} height={76} />;

    if (conversations.isError) {
      return (
        <ErrorState
          message={getApiErrorMessage(conversations.error, t('coach.messages.loadFailed'))}
          onRetry={() => conversations.refetch()}
        />
      );
    }

    if ((conversations.data ?? []).length === 0) {
      return (
        <EmptyState
          icon={<MessageSquare size={32} color={theme.colors.primary} />}
          title={t('coach.messages.emptyTitle')}
          description={t('coach.messages.emptyBody')}
        />
      );
    }

    return (conversations.data ?? []).map((conversation) => {
      const name = participantName(conversation);
      const unread = conversation.unreadCount > 0;
      const stamp = conversation.lastMessageAt ?? conversation.createdAt;

      return (
        <Pressable
          key={conversation.id}
          testID={`coach-conversation-${conversation.id}`}
          onPress={() => router.push(`/coach/conversation/${conversation.id}`)}
          accessibilityRole="button"
          accessibilityLabel={
            unread
              ? `${name}, ${conversation.unreadCount} unread`
              : name
          }
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        >
          <Avatar
            url={conversation.participant.avatarUrl ?? undefined}
            name={name}
            size={44}
          />

          <View style={styles.rowBody}>
            <View style={styles.rowTop}>
              <Text style={[styles.name, unread && styles.nameUnread]} numberOfLines={1}>
                {name}
              </Text>
              <Text style={styles.stamp}>{relativeDayLabel(stamp)}</Text>
            </View>
            <Text
              style={[styles.preview, unread && styles.previewUnread]}
              numberOfLines={1}
            >
              {preview(conversation, t('coach.messages.noMessages'))}
            </Text>
          </View>

          {unread && (
            <View style={styles.unreadDot} accessibilityElementsHidden importantForAccessibility="no" />
          )}
        </Pressable>
      );
    });
  };

  return (
    <ScreenContainer
      insideTabs
      onRefresh={() => conversations.refetch()}
      refreshing={conversations.isFetching}
    >
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          {t('coach.messages.title')}
        </Text>
        <Text style={styles.subtitle}>{t('coach.messages.tagline')}</Text>
      </View>

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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    // Clears the 44pt minimum on its own, before the avatar is counted.
    minHeight: 64,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
  },
  rowPressed: { backgroundColor: theme.colors.surfaceElevated },
  rowBody: { flex: 1 },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  name: { ...theme.typography.bodyMd, color: theme.colors.text, flexShrink: 1 },
  nameUnread: { ...theme.typography.headingSm, color: theme.colors.text },
  stamp: { ...theme.typography.bodyXs, color: theme.colors.textSecondary },
  preview: {
    ...theme.typography.bodySm,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  previewUnread: { color: theme.colors.text },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.primary,
  },
}));
