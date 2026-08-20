import React from 'react';
import { View, Text, Pressable, ViewStyle } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { ChevronRight } from 'lucide-react-native';

interface SectionHeaderProps {
  title: string;
  onSeeAll?: () => void;
  style?: ViewStyle;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({ title, onSeeAll, style }) => {
  const { styles, theme } = useStyles(stylesheet);

  return (
    <View style={[styles.container, style]}>
      <Text style={styles.title}>{title}</Text>
      {onSeeAll && (
        <Pressable onPress={onSeeAll} style={styles.seeAllContainer}>
          <Text style={styles.seeAllText}>See All</Text>
          <ChevronRight size={16} color={theme.colors.primary} />
        </Pressable>
      )}
    </View>
  );
};

const stylesheet = createStyleSheet((theme) => ({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  title: {
    ...theme.typography.headingLg,
    color: theme.colors.text,
  },
  seeAllContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  seeAllText: {
    ...theme.typography.labelSm,
    color: theme.colors.primary,
    marginRight: theme.spacing.xs,
  },
}));
