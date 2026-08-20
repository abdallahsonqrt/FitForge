import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { Play, Lock } from 'lucide-react-native';
import { Badge } from '../ui';

interface ExerciseCardProps {
  name: string;
  targetMuscle: string;
  sets: number;
  reps: string; // e.g., '8-12'
  thumbnailUrl?: string;
  isLocked?: boolean;
  onPress?: () => void;
}

export const ExerciseCard: React.FC<ExerciseCardProps> = ({
  name,
  targetMuscle,
  sets,
  reps,
  thumbnailUrl,
  isLocked = false,
  onPress,
}) => {
  const { styles, theme } = useStyles(stylesheet);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.container, pressed && !isLocked && styles.pressed]}
      disabled={isLocked}
    >
      <View style={styles.thumbnailContainer}>
        {thumbnailUrl ? (
          <Image source={{ uri: thumbnailUrl }} style={styles.thumbnail} contentFit="cover" />
        ) : (
          <View style={[styles.thumbnail, styles.thumbnailPlaceholder]} />
        )}
        <View style={styles.thumbnailOverlay}>
          {isLocked ? (
            <Lock size={20} color={theme.colors.surface} />
          ) : (
            <Play size={20} color={theme.colors.surface} />
          )}
        </View>
      </View>
      
      <View style={styles.infoContainer}>
        <View style={styles.headerRow}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          {isLocked && <Badge label="PRO" variant="premium" style={{ transform: [{ scale: 0.8 }] }} />}
        </View>
        <Text style={styles.muscle}>{targetMuscle}</Text>
        <View style={styles.statsRow}>
          <Text style={styles.statText}>{sets} sets</Text>
          <Text style={styles.statDot}>•</Text>
          <Text style={styles.statText}>{reps} reps</Text>
        </View>
      </View>
    </Pressable>
  );
};

const stylesheet = createStyleSheet((theme) => ({
  container: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.sm,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  thumbnailContainer: {
    width: 80,
    height: 80,
    borderRadius: theme.borderRadius.md,
    overflow: 'hidden',
    position: 'relative',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  thumbnailPlaceholder: {
    backgroundColor: theme.colors.surfaceElevated,
  },
  thumbnailOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoContainer: {
    flex: 1,
    marginLeft: theme.spacing.md,
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  name: {
    ...theme.typography.labelLg,
    color: theme.colors.text,
    flex: 1,
  },
  muscle: {
    ...theme.typography.bodySm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statText: {
    ...theme.typography.labelSm,
    color: theme.colors.text,
  },
  statDot: {
    color: theme.colors.textSecondary,
    marginHorizontal: theme.spacing.xs,
  },
}));
