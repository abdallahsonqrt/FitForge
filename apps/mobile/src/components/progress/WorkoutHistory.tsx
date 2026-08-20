import React from 'react';
import { View, Text } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { Calendar, Clock } from 'lucide-react-native';
import { formatDuration } from '../../utils/formatters';
import { relativeDayLabel } from '../../utils/date';
import type { WorkoutLog } from '../../features/progress/types';

interface WorkoutHistoryProps {
  sessions: WorkoutLog[];
  /** `planId` → plan name. Logs only carry the id, so the caller resolves names. */
  planNames?: Record<string, string>;
}

export const WorkoutHistory: React.FC<WorkoutHistoryProps> = ({ sessions, planNames = {} }) => {
  const { styles, theme } = useStyles(stylesheet);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Calendar size={20} color={theme.colors.primary} />
        <Text style={styles.title}>Recent Workouts</Text>
      </View>

      {sessions.length === 0 ? (
        <Text style={styles.empty}>Your completed workouts will appear here. Start a plan to build your history.</Text>
      ) : (
        sessions.map((session, index) => (
          <View key={session.id}>
            {index > 0 && <View style={styles.separator} />}
            <View style={styles.itemContainer}>
              <View style={styles.dateCol}>
                <Text style={styles.dateText}>{relativeDayLabel(session.completedAt)}</Text>
              </View>
              <View style={styles.infoCol}>
                <Text style={styles.planName}>
                  {(session.planId && planNames[session.planId]) || 'Workout session'}
                </Text>
                <View style={styles.stat}>
                  <Clock size={12} color={theme.colors.textSecondary} />
                  <Text style={styles.statText}>
                    {session.durationSeconds ? formatDuration(session.durationSeconds) : 'Duration not recorded'}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        ))
      )}
    </View>
  );
};

const stylesheet = createStyleSheet((theme) => ({
  container: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  title: {
    ...theme.typography.headingMd,
    color: theme.colors.text,
  },
  empty: {
    ...theme.typography.bodySm,
    color: theme.colors.textSecondary,
    paddingVertical: theme.spacing.sm,
  },
  itemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
  },
  dateCol: {
    width: 76,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceElevated,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.xs,
    borderRadius: theme.borderRadius.sm,
    marginRight: theme.spacing.md,
  },
  dateText: {
    ...theme.typography.bodySm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  infoCol: {
    flex: 1,
  },
  planName: {
    ...theme.typography.labelMd,
    color: theme.colors.text,
    marginBottom: 4,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    ...theme.typography.bodySm,
    color: theme.colors.textSecondary,
  },
  separator: {
    height: 1,
    backgroundColor: theme.colors.border,
  },
}));
