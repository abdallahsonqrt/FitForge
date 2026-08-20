import React from 'react';
import { View, Text, ViewStyle } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'premium';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  style?: ViewStyle;
}

export const Badge: React.FC<BadgeProps> = ({ label, variant = 'default', style }) => {
  const { styles } = useStyles(stylesheet);

  return (
    <View style={[styles.container, styles.variantContainer(variant), style]}>
      <Text style={[styles.text, styles.variantText(variant)]}>{label}</Text>
    </View>
  );
};

const stylesheet = createStyleSheet((theme) => ({
  container: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs / 2,
    borderRadius: theme.borderRadius.full,
    alignSelf: 'flex-start',
  },
  text: {
    ...theme.typography.labelSm,
    fontSize: 10,
    textTransform: 'uppercase',
  },
  variantContainer: (variant: BadgeVariant) => {
    switch (variant) {
      case 'default':
        return { backgroundColor: theme.colors.surfaceElevated };
      case 'success':
        return { backgroundColor: `${theme.colors.success}20` }; // 20% opacity
      case 'warning':
        return { backgroundColor: `${theme.colors.warning}20` };
      case 'error':
        return { backgroundColor: `${theme.colors.error}20` };
      case 'premium':
        return { backgroundColor: `${theme.colors.warning}30` }; // golden
    }
  },
  variantText: (variant: BadgeVariant) => {
    switch (variant) {
      case 'default':
        return { color: theme.colors.textSecondary };
      case 'success':
        return { color: theme.colors.success };
      case 'warning':
        return { color: theme.colors.warning };
      case 'error':
        return { color: theme.colors.error };
      case 'premium':
        return { color: theme.colors.warning }; // golden
    }
  },
}));
