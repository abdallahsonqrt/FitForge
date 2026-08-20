import React from 'react';
import { View, ViewStyle } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';

interface DividerProps {
  style?: ViewStyle;
}

export const Divider: React.FC<DividerProps> = ({ style }) => {
  const { styles } = useStyles(stylesheet);
  return <View style={[styles.divider, style]} />;
};

const stylesheet = createStyleSheet((theme) => ({
  divider: {
    height: 1,
    width: '100%',
    backgroundColor: theme.colors.border,
    marginVertical: theme.spacing.md,
  },
}));
