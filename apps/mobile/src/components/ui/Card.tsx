import React from 'react';
import { View, Pressable, ViewStyle, StyleProp } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';

interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  elevated?: boolean;
}

export const Card: React.FC<CardProps> = ({ children, onPress, style, elevated = false }) => {
  const { styles } = useStyles(stylesheet);

  const containerStyle = [
    styles.base,
    elevated && styles.elevated,
    style,
  ];

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [containerStyle, pressed && styles.pressed]}>
        {children}
      </Pressable>
    );
  }

  return <View style={containerStyle}>{children}</View>;
};

const stylesheet = createStyleSheet((theme) => ({
  base: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  elevated: {
    backgroundColor: theme.colors.surfaceElevated,
    ...theme.shadows.sm,
  },
  pressed: {
    opacity: 0.94,
    transform: [{ scale: 0.99 }],
  },
}));
