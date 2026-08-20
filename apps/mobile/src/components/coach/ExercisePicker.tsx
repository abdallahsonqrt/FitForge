import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { Search } from 'lucide-react-native';
import { Button, EmptyState, Input, Modal, SkeletonList } from '../ui';
import { useExercises } from '../../features/training/api/useExercises';
import type { Exercise } from '../../features/training/types';
import type { CreateDayExercisePayload } from '../../features/coaching/api/useCoachPrograms';
import { useTranslation } from '../../i18n';

interface ExercisePickerProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateDayExercisePayload) => void;
  isSubmitting?: boolean;
  error?: string;
}

/** Enough of the library to scroll without turning the sheet into a second screen. */
const RESULT_LIMIT = 25;

/**
 * Pick an exercise from the catalogue, then prescribe it.
 *
 * Two steps in one sheet: searching and prescribing are different questions, and
 * showing sets/reps before an exercise is chosen would ask the coach to fill in
 * numbers for nothing. The prescription is seeded from the catalogue row's own
 * defaults so the common case is "pick it and save".
 */
export const ExercisePicker: React.FC<ExercisePickerProps> = ({
  visible,
  onClose,
  onSubmit,
  isSubmitting = false,
  error,
}) => {
  const { styles, theme } = useStyles(stylesheet);
  const { t } = useTranslation();

  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Exercise | null>(null);
  const [sets, setSets] = useState('3');
  const [reps, setReps] = useState('10');
  const [rest, setRest] = useState('60');
  const [notes, setNotes] = useState('');
  const [localError, setLocalError] = useState<string | undefined>();

  const results = useExercises({ search: search.trim() || undefined, limit: RESULT_LIMIT });
  const items = useMemo(() => results.data?.items ?? [], [results.data]);

  const reset = () => {
    setSearch('');
    setSelected(null);
    setSets('3');
    setReps('10');
    setRest('60');
    setNotes('');
    setLocalError(undefined);
  };

  const close = () => {
    reset();
    onClose();
  };

  const choose = (exercise: Exercise) => {
    setSelected(exercise);
    // The catalogue carries sensible defaults per exercise; use them as the
    // starting prescription rather than a generic 3x10.
    setSets(String(exercise.defaultSets || 3));
    setReps(String(exercise.defaultReps || 10));
    setRest(String(exercise.defaultRestSeconds || 60));
    setLocalError(undefined);
  };

  const submit = () => {
    if (!selected) return;

    const setsValue = Number(sets);
    const repsValue = reps.trim() ? Number(reps) : undefined;
    const restValue = rest.trim() ? Number(rest) : undefined;

    if (!Number.isInteger(setsValue) || setsValue < 1) {
      setLocalError(t('coach.profile.numberRange', { min: 1, max: 20 }));
      return;
    }
    if (repsValue !== undefined && (!Number.isInteger(repsValue) || repsValue < 1)) {
      setLocalError(t('coach.profile.numberRange', { min: 1, max: 100 }));
      return;
    }
    // The API rejects a prescription that describes no work at all, so require
    // either a rep count or a coaching note before sending it.
    if (repsValue === undefined && notes.trim().length === 0) {
      setLocalError(t('coach.common.required'));
      return;
    }

    onSubmit({
      exerciseId: selected.id,
      sets: setsValue,
      ...(repsValue !== undefined ? { reps: repsValue } : {}),
      ...(restValue !== undefined && Number.isInteger(restValue) && restValue >= 0
        ? { restSeconds: restValue }
        : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    });
  };

  const renderResults = () => {
    if (results.isLoading) return <SkeletonList count={5} height={56} />;

    if (items.length === 0) {
      return (
        <EmptyState
          icon={<Search size={28} color={theme.colors.primary} />}
          title={t('coach.builder.noResults')}
          description={t('coach.builder.searchExercises')}
        />
      );
    }

    return (
      <ScrollView style={styles.results} keyboardShouldPersistTaps="handled">
        {items.map((exercise) => (
          <Pressable
            key={exercise.id}
            onPress={() => choose(exercise)}
            accessibilityRole="button"
            accessibilityLabel={exercise.name}
            style={({ pressed }) => [styles.result, pressed && styles.resultPressed]}
          >
            <Text style={styles.resultName} numberOfLines={1}>
              {exercise.name}
            </Text>
            {exercise.primaryMuscles.length > 0 && (
              <Text style={styles.resultMeta} numberOfLines={1}>
                {exercise.primaryMuscles.map((muscle) => muscle.name).join(', ')}
              </Text>
            )}
          </Pressable>
        ))}
      </ScrollView>
    );
  };

  return (
    <Modal visible={visible} onClose={close}>
      <Text style={styles.title} accessibilityRole="header">
        {selected ? selected.name : t('coach.builder.addExercise')}
      </Text>

      {!selected ? (
        <>
          <Input
            label={t('coach.builder.searchExercises')}
            value={search}
            onChangeText={setSearch}
            leftIcon={<Search size={18} color={theme.colors.textSecondary} />}
            autoCorrect={false}
          />
          {renderResults()}
        </>
      ) : (
        <>
          <View style={styles.numbers}>
            <View style={styles.number}>
              <Input
                label={t('coach.builder.sets')}
                value={sets}
                onChangeText={setSets}
                keyboardType="number-pad"
              />
            </View>
            <View style={styles.number}>
              <Input
                label={t('coach.builder.reps')}
                value={reps}
                onChangeText={setReps}
                keyboardType="number-pad"
              />
            </View>
            <View style={styles.number}>
              <Input
                label={t('coach.builder.rest')}
                value={rest}
                onChangeText={setRest}
                keyboardType="number-pad"
              />
            </View>
          </View>

          <Input
            label={t('coach.builder.exerciseNotes')}
            value={notes}
            onChangeText={setNotes}
            multiline
            error={localError ?? error}
          />

          <View style={styles.actions}>
            <Button
              title={t('common.back')}
              variant="outline"
              onPress={() => setSelected(null)}
              style={styles.action}
            />
            <Button
              title={t('coach.builder.addExercise')}
              onPress={submit}
              loading={isSubmitting}
              style={styles.action}
            />
          </View>
        </>
      )}
    </Modal>
  );
};

const stylesheet = createStyleSheet((theme) => ({
  title: {
    ...theme.typography.headingLg,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  results: { maxHeight: 280, marginTop: theme.spacing.sm },
  result: {
    minHeight: 48,
    justifyContent: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
  },
  resultPressed: { backgroundColor: theme.colors.surfaceElevated },
  resultName: { ...theme.typography.bodyMd, color: theme.colors.text },
  resultMeta: {
    ...theme.typography.bodyXs,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  numbers: { flexDirection: 'row', gap: theme.spacing.sm },
  number: { flex: 1 },
  actions: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.md },
  action: { flex: 1 },
}));
