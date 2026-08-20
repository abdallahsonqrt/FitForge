import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, FlatList, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { Send } from 'lucide-react-native';
import { KeyboardAvoidingWrapper } from '../../../src/components/layout/KeyboardAvoidingWrapper';
import { ChatBubble } from '../../../src/components/nutrition/ChatBubble';
import { EmptyState, ErrorState, SkeletonList } from '../../../src/components/ui';
import {
  useConversationMessages,
  useConversations,
  useMarkConversationRead,
  useSendMessage,
} from '../../../src/features/coaching/api/useConversations';
import type { Message } from '../../../src/features/coaching/types';
import { getApiErrorMessage } from '../../../src/lib/api';
import { showAlert } from '../../../src/lib/alert';
import { useAuthStore } from '../../../src/store/authStore';
import { useTranslation } from '../../../src/i18n';
import { MessageSquare } from 'lucide-react-native';

/** Matches the API's own ceiling on a message body. */
const MAX_BODY = 4000;

export default function CoachConversationScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const { styles, theme } = useStyles(stylesheet);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const myUserId = useAuthStore((state) => state.user?.id);

  const conversations = useConversations();
  const thread = useConversationMessages(conversationId);
  const sendMessage = useSendMessage(conversationId);
  const markRead = useMarkConversationRead();

  const [draft, setDraft] = useState('');

  const conversation = useMemo(
    () => (conversations.data ?? []).find((item) => item.id === conversationId),
    [conversations.data, conversationId],
  );

  const participantName = useMemo(() => {
    if (!conversation) return null;
    return (
      [conversation.participant.firstName, conversation.participant.lastName]
        .filter(Boolean)
        .join(' ')
        .trim() || null
    );
  }, [conversation]);

  // The stack header is registered generically in `_layout`; name it once the
  // roster tells us who this thread is with.
  useEffect(() => {
    if (participantName) navigation.setOptions({ title: participantName });
  }, [navigation, participantName]);

  /**
   * Mark read once per thread open. `markRead` no-ops server-side when nothing
   * was unread, and the ref stops a re-render (a new message arriving) from
   * firing it again.
   */
  const markedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!conversationId || markedRef.current === conversationId) return;
    markedRef.current = conversationId;
    markRead.mutate(conversationId);
  }, [conversationId, markRead]);

  /**
   * The API returns newest-first and pages backwards in time, which is exactly
   * what an inverted list wants: index 0 sits at the bottom, and `onEndReached`
   * fires at the *top* — where older messages belong.
   */
  const messages: Message[] = useMemo(
    () => (thread.data?.pages ?? []).flatMap((page) => page.messages),
    [thread.data],
  );

  const trimmed = draft.trim();
  const canSend = trimmed.length > 0 && trimmed.length <= MAX_BODY && !sendMessage.isPending;

  const handleSend = () => {
    if (!canSend) return;
    // Cleared optimistically: the mutation refetches the thread on success, and
    // on failure the text is handed back in the alert rather than silently lost.
    setDraft('');
    sendMessage.mutate(trimmed, {
      onError: (error) => {
        setDraft(trimmed);
        showAlert(
          t('coach.messages.sendFailed'),
          getApiErrorMessage(error, t('coach.messages.sendFailed')),
        );
      },
    });
  };

  const renderBody = () => {
    if (thread.isLoading) {
      return (
        <View style={styles.loading}>
          <SkeletonList count={6} height={56} />
        </View>
      );
    }

    if (thread.isError) {
      return (
        <ErrorState
          message={getApiErrorMessage(thread.error, t('coach.messages.loadFailed'))}
          onRetry={() => thread.refetch()}
        />
      );
    }

    if (messages.length === 0) {
      return (
        <EmptyState
          icon={<MessageSquare size={32} color={theme.colors.primary} />}
          title={t('coach.messages.emptyTitle')}
          description={t('coach.messages.noMessages')}
        />
      );
    }

    return (
      <FlatList
        inverted
        data={messages}
        keyExtractor={(message) => message.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (thread.hasNextPage && !thread.isFetchingNextPage) thread.fetchNextPage();
        }}
        ListFooterComponent={
          thread.isFetchingNextPage ? (
            <ActivityIndicator style={styles.olderSpinner} color={theme.colors.primary} />
          ) : null
        }
        renderItem={({ item }) => (
          <ChatBubble message={item.body ?? ''} isUser={item.senderUserId === myUserId} />
        )}
      />
    );
  };

  return (
    <KeyboardAvoidingWrapper>
      <View style={styles.screen}>
        <View style={styles.body}>{renderBody()}</View>

        <View style={[styles.inputBar, { paddingBottom: theme.spacing.sm + insets.bottom }]}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder={t('coach.messages.placeholder')}
            placeholderTextColor={theme.colors.textSecondary}
            multiline
            maxLength={MAX_BODY}
            accessibilityLabel={t('coach.messages.placeholder')}
          />
          <Pressable
            onPress={handleSend}
            disabled={!canSend}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('coach.messages.send')}
            accessibilityState={{ disabled: !canSend }}
            style={[styles.send, !canSend && styles.sendDisabled]}
          >
            {sendMessage.isPending ? (
              <ActivityIndicator size="small" color={theme.colors.onPrimary} />
            ) : (
              <Send size={20} color={theme.colors.onPrimary} />
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingWrapper>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  body: { flex: 1, paddingHorizontal: theme.spacing.lg },
  loading: { paddingTop: theme.spacing.lg },
  list: { paddingVertical: theme.spacing.lg },
  olderSpinner: { marginVertical: theme.spacing.md },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  input: {
    flex: 1,
    ...theme.typography.bodyMd,
    color: theme.colors.text,
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    minHeight: 44,
    maxHeight: 120,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.5 },
}));
