import React from 'react';
import { View } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { Button } from '../ui';
import { SkipForward, Check } from 'lucide-react-native';

interface WorkoutControlsProps {
  onNext: () => void;
  onComplete: () => void;
  onSkip: () => void;
  isLastExercise?: boolean;
}

export const WorkoutControls: React.FC<WorkoutControlsProps> = ({
  onNext,
  onComplete,
  onSkip,
  isLastExercise,
}) => {
  const { styles, theme } = useStyles(stylesheet);

  return (
    <View style={styles.container}>
      <Button
        title="Skip"
        variant="ghost"
        icon={<SkipForward size={20} color={theme.colors.primary} />}
        onPress={onSkip}
        style={styles.skipButton}
      />
      {isLastExercise ? (
        <Button
          title="Finish Workout"
          icon={<Check size={20} color={theme.colors.background} />}
          onPress={onComplete}
          style={styles.mainButton}
        />
      ) : (
        <Button
          title="Next Exercise"
          onPress={onNext}
          style={styles.mainButton}
        />
      )}
    </View>
  );
};

const stylesheet = createStyleSheet((theme) => ({
  container: {
    flexDirection: 'row',
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    gap: theme.spacing.md,
  },
  skipButton: {
    flex: 1,
  },
  mainButton: {
    flex: 2,
  },
}));
