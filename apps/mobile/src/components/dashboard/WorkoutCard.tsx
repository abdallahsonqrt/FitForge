import React from 'react';
import { View, Text } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { Card, Button } from '../ui';
import { Play, Clock, Dumbbell } from 'lucide-react-native';

interface WorkoutCardProps {
  /** Eyebrow above the plan name, e.g. "Today's workout" or "Recommended". */
  label: string;
  planName: string;
  exerciseCount: number;
  estimatedMinutes: number;
  onStart: () => void;
}

export const WorkoutCard: React.FC<WorkoutCardProps> = ({
  label,
  planName,
  exerciseCount,
  estimatedMinutes,
  onStart,
}) => {
  const { styles, theme } = useStyles(stylesheet);

  return (
    <Card elevated style={styles.card}>
      <View style={styles.accent} />
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.planName}>{planName}</Text>
        </View>

        <View style={styles.statsContainer}>
          <View style={styles.stat}>
            <Dumbbell size={16} color={theme.colors.textSecondary} />
            <Text style={styles.statText}>
              {exerciseCount} exercise{exerciseCount === 1 ? '' : 's'}
            </Text>
          </View>
          <View style={styles.stat}>
            <Clock size={16} color={theme.colors.textSecondary} />
            <Text style={styles.statText}>~{estimatedMinutes} min</Text>
          </View>
        </View>

        <Button
          title="Start Workout"
          icon={<Play size={16} color={theme.colors.onPrimary} />}
          onPress={onStart}
          style={styles.button}
        />
      </View>
    </Card>
  );
};

const stylesheet = createStyleSheet((theme) => ({
  card: {
    position: 'relative',
    overflow: 'hidden',
    padding: 0,
    marginBottom: theme.spacing.xl,
  },
  accent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: theme.colors.primary,
  },
  content: {
    padding: theme.spacing.lg,
  },
  header: {
    marginBottom: theme.spacing.md,
  },
  label: {
    ...theme.typography.labelSm,
    color: theme.colors.primary,
    textTransform: 'uppercase',
    marginBottom: theme.spacing.xs,
  },
  planName: {
    ...theme.typography.headingLg,
    color: theme.colors.text,
  },
  statsContainer: {
    flexDirection: 'row',
    gap: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  statText: {
    ...theme.typography.bodySm,
    color: theme.colors.textSecondary,
  },
  button: {
    width: '100%',
  },
}));
