import React from 'react';
import { View, Text } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { ProgressRing } from '../ui';

interface WorkoutTimerProps {
  remainingSeconds: number;
  totalSeconds: number;
  label?: string;
}

export const WorkoutTimer: React.FC<WorkoutTimerProps> = ({
  remainingSeconds,
  totalSeconds,
  label = 'Rest',
}) => {
  const { styles, theme } = useStyles(stylesheet);
  
  const progress = totalSeconds > 0 ? remainingSeconds / totalSeconds : 0;
  
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return (
    <View style={styles.container}>
      <ProgressRing
        progress={progress}
        size={240}
        strokeWidth={16}
        color={theme.colors.primary}
        backgroundColor={theme.colors.surfaceElevated}
      >
        <View style={styles.innerContent}>
          <Text style={styles.timeText}>{timeString}</Text>
          <Text style={styles.labelText}>{label}</Text>
        </View>
      </ProgressRing>
    </View>
  );
};

const stylesheet = createStyleSheet((theme) => ({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: theme.spacing.xl,
  },
  innerContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeText: {
    ...theme.typography.displayLg,
    fontSize: 48,
    color: theme.colors.text,
  },
  labelText: {
    ...theme.typography.labelLg,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    marginTop: theme.spacing.sm,
  },
}));
