import React from 'react';
import { View, Text } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';

interface ChatBubbleProps {
  message: string;
  isUser: boolean;
  children?: React.ReactNode;
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({ message, isUser, children }) => {
  const { styles } = useStyles(stylesheet);

  return (
    <View style={[styles.container, isUser ? styles.containerUser : styles.containerAi]}>
      {message ? (
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAi]}>
          <Text style={[styles.text, isUser ? styles.textUser : styles.textAi]}>
            {message}
          </Text>
        </View>
      ) : null}
      {children && <View style={styles.childrenContainer}>{children}</View>}
    </View>
  );
};

const stylesheet = createStyleSheet((theme) => ({
  container: {
    width: '100%',
    marginBottom: theme.spacing.md,
    flexDirection: 'column',
  },
  containerUser: {
    alignItems: 'flex-end',
  },
  containerAi: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '80%',
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.xl,
  },
  bubbleUser: {
    backgroundColor: theme.colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleAi: {
    backgroundColor: theme.colors.surfaceElevated,
    borderBottomLeftRadius: 4,
  },
  text: {
    ...theme.typography.bodyMd,
  },
  textUser: {
    color: '#FFFFFF',
  },
  textAi: {
    color: theme.colors.text,
  },
  childrenContainer: {
    marginTop: theme.spacing.sm,
    width: '85%',
  },
}));
