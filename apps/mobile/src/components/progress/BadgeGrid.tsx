import React from 'react';
import { View, Text, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { Award } from 'lucide-react-native';
import { relativeDayLabel } from '../../utils/date';
import type { UserBadge } from '../../features/progress/types';

interface BadgeGridProps {
  badges: UserBadge[];
}

/** Earned badges from `GET /progress/badges`; falls back to an icon when the badge has no art. */
export const BadgeGrid: React.FC<BadgeGridProps> = ({ badges }) => {
  const { styles, theme } = useStyles(stylesheet);
  const { width } = useWindowDimensions();
  const columnCount = width >= 600 ? 4 : 3;
  const badgeWidth = columnCount === 4 ? '22%' : '30%';

  return (
    <View style={styles.container}>
      {badges.map((entry) => (
        <View key={entry.id} style={[styles.badgeContainer, { width: badgeWidth }]}>
          <View style={styles.iconContainer}>
            {entry.badge.iconUrl ? (
              <Image source={{ uri: entry.badge.iconUrl }} style={styles.icon} contentFit="contain" />
            ) : (
              <Award size={28} color={theme.colors.warning} />
            )}
          </View>
          <Text style={styles.badgeName} numberOfLines={2}>
            {entry.badge.name}
          </Text>
          <Text style={styles.earnedAt}>{relativeDayLabel(entry.earnedAt)}</Text>
        </View>
      ))}
    </View>
  );
};

const stylesheet = createStyleSheet((theme) => ({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  badgeContainer: {
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: theme.colors.warningSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.xs,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  icon: {
    width: 36,
    height: 36,
  },
  badgeName: {
    ...theme.typography.labelSm,
    color: theme.colors.text,
    textAlign: 'center',
  },
  earnedAt: {
    ...theme.typography.bodyXs,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: 2,
  },
}));
