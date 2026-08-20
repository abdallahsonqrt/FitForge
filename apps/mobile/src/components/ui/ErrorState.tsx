import React from 'react';
import { View, Text, ViewStyle } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { AlertCircle } from 'lucide-react-native';
import { Button } from './Button';
import { useTranslation } from '../../i18n';

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  style?: ViewStyle;
}

export const ErrorState: React.FC<ErrorStateProps> = ({ title, message, onRetry, style }) => {
  const { styles, theme } = useStyles(stylesheet);
  const { t } = useTranslation();

  // These defaults are the error copy for every screen that renders this
  // component, so hardcoding them left the whole app's error path untranslated.
  const heading = title ?? t('common.somethingWentWrong');

  return (
    // An error that replaces the screen's content needs to be announced, not
    // just drawn — otherwise a screen-reader user is left on a silent page.
    <View
      style={[styles.container, style]}
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
    >
      <View style={styles.iconContainer}>
        <AlertCircle color={theme.colors.error} size={32} />
      </View>
      <Text style={styles.title}>{heading}</Text>
      <Text style={styles.message}>{message}</Text>
      {onRetry && (
        <Button
          title={t('common.retry')}
          onPress={onRetry}
          variant="outline"
          style={styles.button}
        />
      )}
    </View>
  );
};

const stylesheet = createStyleSheet((theme) => ({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  iconContainer: {
    marginBottom: theme.spacing.lg,
    padding: theme.spacing.md,
    backgroundColor: `${theme.colors.error}20`,
    borderRadius: theme.borderRadius.full,
  },
  title: {
    ...theme.typography.headingLg,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  message: {
    ...theme.typography.bodyMd,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.xl,
  },
  button: {
    minWidth: 150,
  },
}));
