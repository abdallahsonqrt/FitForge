import React from 'react';
import { View, Text } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { Check } from 'lucide-react-native';

interface StreakCalendarProps {
  activeDates: string[]; // YYYY-MM-DD
}

export const StreakCalendar: React.FC<StreakCalendarProps> = ({ activeDates }) => {
  const { styles, theme } = useStyles(stylesheet);
  
  // Create a simple 7x5 grid for the last 35 days for demonstration
  const today = new Date();
  const days = Array.from({ length: 35 }).map((_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (34 - i));
    return d.toISOString().split('T')[0];
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Your last 5 weeks</Text>
          <Text style={styles.description}>Each filled square is a completed workout.</Text>
        </View>
        <View style={styles.legend}>
          <View style={styles.legendCell}>
            <Check size={12} color={theme.colors.onPrimary} />
          </View>
          <Text style={styles.legendText}>Workout</Text>
        </View>
      </View>
      <View style={styles.grid}>
        {days.map((day) => {
          const isActive = activeDates.includes(day);
          return (
            <View
              key={day}
              style={[styles.cell, isActive && styles.cellActive]}
            />
          );
        })}
      </View>
    </View>
  );
};

const stylesheet = createStyleSheet((theme) => ({
  container: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  title: {
    ...theme.typography.labelLg,
    color: theme.colors.text,
  },
  description: {
    ...theme.typography.bodySm,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  headerCopy: {
    flex: 1,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingTop: 2,
  },
  legendCell: {
    width: 18,
    height: 18,
    borderRadius: 5,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legendText: {
    ...theme.typography.bodyXs,
    color: theme.colors.textSecondary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    // The calendar should remain a quick visual summary on wide screens, not
    // grow into the dominant element of the page.
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
  },
  cell: {
    width: '12%',
    aspectRatio: 1,
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: 4,
  },
  cellActive: {
    backgroundColor: theme.colors.primary,
  },
}));
