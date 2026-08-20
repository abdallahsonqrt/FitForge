import React from 'react';
import { View, ActivityIndicator, Text } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';

interface LoadingOverlayProps {
  message?: string;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ message = 'Loading...' }) => {
  const { styles, theme } = useStyles(stylesheet);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={theme.colors.primary} />
      {message && <Text style={styles.message}>{message}</Text>}
    </View>
  );
};

const stylesheet = createStyleSheet((theme) => ({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    // Was a hardcoded near-black, which put a dark sheet over the light theme.
    backgroundColor: theme.colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  message: {
    ...theme.typography.bodyLg,
    color: theme.colors.text,
    marginTop: theme.spacing.md,
  },
}));
