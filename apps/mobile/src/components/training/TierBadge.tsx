import React from 'react';
import { View, Text, ViewStyle } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';

interface TierBadgeProps {
  tier: 'free' | 'pro' | 'elite';
  style?: ViewStyle;
}

export const TierBadge: React.FC<TierBadgeProps> = ({ tier, style }) => {
  const { styles } = useStyles(stylesheet);

  const getTierInfo = () => {
    switch (tier) {
      case 'free': return { label: 'FREE', style: styles.free };
      case 'pro': return { label: 'PRO', style: styles.pro };
      case 'elite': return { label: 'ELITE', style: styles.elite };
    }
  };

  const info = getTierInfo();

  return (
    <View style={[styles.container, info.style, style]}>
      <Text style={[styles.text, info.style]}>{info.label}</Text>
    </View>
  );
};

const stylesheet = createStyleSheet((theme) => ({
  container: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
  },
  text: {
    ...theme.typography.labelSm,
    fontSize: 10,
  },
  free: {
    backgroundColor: 'transparent',
    borderColor: theme.colors.border,
    color: theme.colors.textSecondary,
  },
  pro: {
    backgroundColor: `${theme.colors.primary}20`,
    borderColor: theme.colors.primary,
    color: theme.colors.primary,
  },
  elite: {
    backgroundColor: `${theme.colors.warning}20`,
    borderColor: theme.colors.warning,
    color: theme.colors.warning,
  },
}));
