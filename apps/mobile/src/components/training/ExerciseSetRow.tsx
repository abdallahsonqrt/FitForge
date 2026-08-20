import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { Check } from 'lucide-react-native';
import { useTranslation } from '../../i18n';

interface ExerciseSetRowProps {
  setNumber: number;
  initialReps?: string;
  initialWeight?: string;
  isCompleted?: boolean;
  onComplete: (weight: string, reps: string) => void;
}

export const ExerciseSetRow: React.FC<ExerciseSetRowProps> = ({
  setNumber,
  initialReps = '',
  initialWeight = '',
  isCompleted = false,
  onComplete,
}) => {
  const { styles, theme } = useStyles(stylesheet);
  const { t } = useTranslation();
  const [weight, setWeight] = useState(initialWeight);
  const [reps, setReps] = useState(initialReps);

  useEffect(() => {
    setWeight(initialWeight);
    setReps(initialReps);
  }, [initialWeight, initialReps]);

  // The parent owns toggle semantics (its handler adds *and* removes the set).
  // Guarding on `isCompleted` here made the removal branch unreachable, so a
  // set ticked by mistake could never be un-ticked.
  const handleComplete = () => {
    onComplete(weight, reps);
  };

  return (
    <View style={[styles.container, isCompleted && styles.containerCompleted]}>
      <Text style={styles.setNumber}>{setNumber}</Text>
      
      <View style={styles.inputGroup}>
        <TextInput
          style={[styles.input, isCompleted && styles.inputCompleted]}
          value={weight}
          onChangeText={setWeight}
          keyboardType="numeric"
          placeholder="--"
          placeholderTextColor={theme.colors.textSecondary}
          editable={!isCompleted}
        />
        <Text style={styles.unit}>kg</Text>
      </View>
      
      <View style={styles.inputGroup}>
        <TextInput
          style={[styles.input, isCompleted && styles.inputCompleted]}
          value={reps}
          onChangeText={setReps}
          keyboardType="numeric"
          placeholder="--"
          placeholderTextColor={theme.colors.textSecondary}
          editable={!isCompleted}
        />
        <Text style={styles.unit}>reps</Text>
      </View>

      <Pressable
        style={[styles.checkButton, isCompleted && styles.checkButtonCompleted]}
        onPress={handleComplete}
        hitSlop={8}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isCompleted }}
        accessibilityLabel={t('workout.setNumber', { number: setNumber })}
      >
        <Check
          size={20}
          // `background` tracks the theme, but this fill is green in both — in
          // light mode that put a near-white tick on green at ~1.6:1.
          color={isCompleted ? theme.colors.onSuccess : theme.colors.textSecondary}
        />
      </Pressable>
    </View>
  );
};

const stylesheet = createStyleSheet((theme) => ({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.sm,
  },
  containerCompleted: {
    backgroundColor: `${theme.colors.success}10`,
  },
  setNumber: {
    ...theme.typography.labelLg,
    color: theme.colors.textSecondary,
    width: 24,
  },
  inputGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing.sm,
    height: 40,
    // Wide enough for a three-digit weight next to its unit without the two
    // touching — "120" and "reps" are the worst case.
    width: 104,
  },
  input: {
    ...theme.typography.bodyLg,
    color: theme.colors.text,
    flex: 1,
    // Without this the input keeps a browser-default intrinsic width on web and
    // refuses to shrink (flex items default to `min-width: auto`), so the value
    // and its unit spill out to the right of the box that should contain them.
    minWidth: 0,
    textAlign: 'center',
    outlineStyle: 'none',
  },
  inputCompleted: {
    color: theme.colors.success,
  },
  unit: {
    ...theme.typography.bodySm,
    color: theme.colors.textSecondary,
    marginLeft: 4,
  },
  checkButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkButtonCompleted: {
    backgroundColor: theme.colors.success,
  },
}));
