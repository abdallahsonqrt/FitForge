import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { Send, Bot, User, CheckCircle2, AlertCircle } from 'lucide-react-native';
import { useAiMealLog } from '../../src/features/nutrition/api/useAiMealLog';
import { useResponsiveContent } from '../../src/components/layout/useResponsiveContent';
import { getApiErrorMessage } from '../../src/lib/api';

interface LoggedMeal {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  tone?: 'error';
  loggedMeal?: LoggedMeal;
}

const GREETING: Message = {
  id: 'greeting',
  sender: 'ai',
  text: "Tell me what you ate and I'll work out the calories and macros. For example: “two scrambled eggs and a slice of sourdough”.",
};

export default function MealLogScreen() {
  const { styles, theme } = useStyles(stylesheet);
  const scrollRef = useRef<ScrollView>(null);
  const responsiveContent = useResponsiveContent();

  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  /** Set while the assistant is waiting on an answer to its follow-up question. */
  const [conversationId, setConversationId] = useState<string | undefined>();

  const aiLog = useAiMealLog();

  const append = (message: Message) => {
    setMessages((previous) => [...previous, message]);
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  };

  const handleSend = () => {
    const text = inputText.trim();
    if (!text || aiLog.isPending) return;

    append({ id: `user-${Date.now()}`, text, sender: 'user' });
    setInputText('');

    aiLog.mutate(
      { text, conversationId },
      {
        onSuccess: (result) => {
          if (result.status === 'needs_clarification') {
            setConversationId(result.conversationId);
            append({ id: `ai-${Date.now()}`, text: result.message, sender: 'ai' });
            return;
          }

          if (result.status === 'logged') {
            setConversationId(undefined);
            append({
              id: `ai-${Date.now()}`,
              text: `Logged ${result.meal.name}.`,
              sender: 'ai',
              loggedMeal: result.meal,
            });
            return;
          }

          append({ id: `ai-${Date.now()}`, text: result.message, sender: 'ai', tone: 'error' });
        },
        onError: (error) =>
          append({
            id: `ai-${Date.now()}`,
            text: getApiErrorMessage(error, 'The meal logger is unavailable right now.'),
            sender: 'ai',
            tone: 'error',
          }),
      },
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      <ScrollView ref={scrollRef} contentContainerStyle={[styles.chatContainer, responsiveContent]}>
        {messages.map((message) => (
          <View
            key={message.id}
            style={[
              styles.messageWrapper,
              message.sender === 'user' ? styles.messageWrapperUser : styles.messageWrapperAi,
            ]}
          >
            {message.sender === 'ai' && (
              <View style={styles.avatar}>
                <Bot size={18} color={theme.colors.primary} />
              </View>
            )}

            <View style={styles.messageContent}>
              <View
                style={[
                  styles.bubble,
                  message.sender === 'user' ? styles.bubbleUser : styles.bubbleAi,
                  message.tone === 'error' && styles.bubbleError,
                ]}
              >
                {message.tone === 'error' && (
                  <AlertCircle size={16} color={theme.colors.error} style={styles.bubbleIcon} />
                )}
                <Text
                  style={[
                    styles.bubbleText,
                    message.sender === 'user' ? styles.bubbleTextUser : styles.bubbleTextAi,
                    message.tone === 'error' && styles.bubbleTextError,
                  ]}
                >
                  {message.text}
                </Text>
              </View>

              {message.loggedMeal && (
                <View style={styles.mealCard}>
                  <View style={styles.mealCardHeader}>
                    <CheckCircle2 size={16} color={theme.colors.success} />
                    <Text style={styles.mealName}>{message.loggedMeal.name}</Text>
                  </View>
                  <Text style={styles.mealMacros}>
                    {Math.round(message.loggedMeal.calories)} kcal · P{' '}
                    {Math.round(message.loggedMeal.protein)}g · C{' '}
                    {Math.round(message.loggedMeal.carbs)}g · F {Math.round(message.loggedMeal.fat)}g
                  </Text>
                  <Pressable onPress={() => router.push('/(tabs)/nutrition')} hitSlop={6}>
                    <Text style={styles.mealLink}>View today's totals</Text>
                  </Pressable>
                </View>
              )}
            </View>

            {message.sender === 'user' && (
              <View style={styles.avatarUser}>
                <User size={18} color={theme.colors.onPrimary} />
              </View>
            )}
          </View>
        ))}

        {aiLog.isPending && (
          <View style={[styles.messageWrapper, styles.messageWrapperAi]}>
            <View style={styles.avatar}>
              <Bot size={18} color={theme.colors.primary} />
            </View>
            <View style={[styles.bubble, styles.bubbleAi]}>
              <ActivityIndicator size="small" color={theme.colors.textSecondary} />
            </View>
          </View>
        )}
      </ScrollView>

      {/* The bar stays full-bleed so its top border spans the screen; the row
          inside it lines up with the message column. */}
      <View style={styles.inputBar}>
        <View style={[styles.inputContainer, responsiveContent]}>
        <TextInput
          style={styles.textInput}
          placeholder={conversationId ? 'Answer the question above…' : 'I had 2 eggs and toast…'}
          placeholderTextColor={theme.colors.textSecondary}
          value={inputText}
          onChangeText={setInputText}
          onSubmitEditing={handleSend}
          returnKeyType="send"
          editable={!aiLog.isPending}
          multiline
        />
        <Pressable
          style={[styles.sendButton, (!inputText.trim() || aiLog.isPending) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!inputText.trim() || aiLog.isPending}
          accessibilityRole="button"
          accessibilityLabel="Send"
        >
          <Send size={20} color={theme.colors.onPrimary} />
        </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  container: { flex: 1, backgroundColor: theme.colors.background },
  chatContainer: { paddingVertical: theme.spacing.lg, gap: theme.spacing.md },
  messageWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: theme.spacing.sm,
    maxWidth: '90%',
  },
  messageWrapperUser: { alignSelf: 'flex-end' },
  messageWrapperAi: { alignSelf: 'flex-start' },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarUser: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageContent: { gap: theme.spacing.sm, flexShrink: 1 },
  bubble: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
  },
  bubbleUser: {
    backgroundColor: theme.colors.primary,
    borderBottomRightRadius: theme.borderRadius.sm,
  },
  bubbleAi: {
    backgroundColor: theme.colors.surface,
    borderBottomLeftRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  bubbleError: { backgroundColor: theme.colors.errorSoft, borderColor: theme.colors.error },
  bubbleIcon: { marginTop: 2 },
  bubbleText: { ...theme.typography.bodyMd, flexShrink: 1 },
  bubbleTextUser: { color: theme.colors.onPrimary },
  bubbleTextAi: { color: theme.colors.text },
  bubbleTextError: { color: theme.colors.error },
  mealCard: {
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  mealCardHeader: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  mealName: { color: theme.colors.text, ...theme.typography.labelMd, flex: 1 },
  mealMacros: { color: theme.colors.textSecondary, ...theme.typography.bodySm },
  mealLink: { color: theme.colors.primary, ...theme.typography.labelSm, marginTop: theme.spacing.xs },
  inputBar: {
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  inputContainer: {
    flexDirection: 'row',
    paddingVertical: theme.spacing.md,
    alignItems: 'flex-end',
    gap: theme.spacing.sm,
  },
  textInput: {
    flex: 1,
    maxHeight: 120,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    color: theme.colors.text,
    ...theme.typography.bodyMd,
    outlineStyle: 'none',
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: { opacity: 0.4 },
}));
