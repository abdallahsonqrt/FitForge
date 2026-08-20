import React from 'react';
import { Text, Pressable, ViewStyle } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
}

export const Chip: React.FC<ChipProps> = ({ label, selected = false, onPress, style }) => {
  const { styles } = useStyles(stylesheet);

  return (
    <Pressable
      onPress={onPress}
      style={[styles.container, selected && styles.containerSelected, style]}
    >
      <Text style={[styles.text, selected && styles.textSelected]}>{label}</Text>
    </Pressable>
  );
};

const stylesheet = createStyleSheet((theme) => ({
  container: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignSelf: 'flex-start',
  },
  containerSelected: {
    backgroundColor: `${theme.colors.primary}20`,
    borderColor: theme.colors.primary,
  },
  text: {
    ...theme.typography.labelSm,
    color: theme.colors.textSecondary,
  },
  textSelected: {
    color: theme.colors.primary,
  },
}));
