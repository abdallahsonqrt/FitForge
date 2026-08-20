import React, { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react-native';
import { ScreenContainer } from '../../../src/components/layout/ScreenContainer';
import { Badge, Button, EmptyState, ErrorState, Input, Modal, SkeletonList } from '../../../src/components/ui';
import { ReorderButtons } from '../../../src/components/coach/ReorderButtons';
import { ExercisePicker } from '../../../src/components/coach/ExercisePicker';
import {
  movedIds,
  useAddDay,
  useAddDayExercise,
  useAddWeek,
  useArchiveProgram,
  useCoachProgram,
  useDayExercises,
  useDeleteDay,
  useDeleteDayExercise,
  useDeleteProgram,
  useDeleteWeek,
  usePublishProgram,
  useReorderDayExercises,
  useReorderDays,
  useReorderWeeks,
} from '../../../src/features/coaching/api/useCoachPrograms';
import type { ProgramDay, ProgramVisibility, ProgramWeek } from '../../../src/features/coaching/types';
import { getApiErrorMessage } from '../../../src/lib/api';
import { showAlert } from '../../../src/lib/alert';
import { useTranslation, type TranslationKey } from '../../../src/i18n';

const VISIBILITY_LABEL: Record<ProgramVisibility, TranslationKey> = {
  draft: 'coach.programs.draft',
  published: 'coach.programs.published',
  archived: 'coach.programs.archived',
};

const VISIBILITY_VARIANT: Record<ProgramVisibility, 'default' | 'success' | 'warning'> = {
  draft: 'warning',
  published: 'success',
  archived: 'default',
};

/**
 * One workout, with its prescriptions loaded only once expanded.
 *
 * A component rather than inline markup because each day owns hooks — its
 * exercise query and three mutations — and hooks cannot be called from a loop.
 */
const DaySection: React.FC<{
  planId: string;
  day: ProgramDay;
  index: number;
  dayCount: number;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
}> = ({ planId, day, index, dayCount, onMove, onDelete }) => {
  const { styles, theme } = useStyles(stylesheet);
  const { t } = useTranslation();

  const [expanded, setExpanded] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const [pickerError, setPickerError] = useState<string | undefined>();

  const exercises = useDayExercises(planId, day.id, expanded);
  const addExercise = useAddDayExercise(planId, day.id);
  const deleteExercise = useDeleteDayExercise(planId, day.id);
  const reorderExercises = useReorderDayExercises(planId, day.id);

  const rows = exercises.data ?? [];

  const moveExercise = (position: number, direction: -1 | 1) => {
    const order = movedIds(rows, position, direction);
    if (order) reorderExercises.mutate(order);
  };

  const confirmRemoveExercise = (id: string, name: string) => {
    showAlert(t('coach.builder.removeExercise'), name, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.remove'),
        style: 'destructive',
        onPress: () => deleteExercise.mutate(id),
      },
    ]);
  };

  return (
    <View style={styles.day}>
      <View style={styles.dayHeader}>
        <Pressable
          onPress={() => setExpanded((value) => !value)}
          accessibilityRole="button"
          accessibilityLabel={day.dayName}
          accessibilityState={{ expanded }}
          hitSlop={6}
          style={styles.dayToggle}
        >
          {expanded ? (
            <ChevronDown size={18} color={theme.colors.textSecondary} />
          ) : (
            <ChevronRight size={18} color={theme.colors.textSecondary} />
          )}
          <Text style={styles.dayName} numberOfLines={1}>
            {day.dayName}
          </Text>
        </Pressable>

        <ReorderButtons
          canMoveUp={index > 0}
          canMoveDown={index < dayCount - 1}
          onMoveUp={() => onMove(-1)}
          onMoveDown={() => onMove(1)}
          itemLabel={day.dayName}
        />

        <Pressable
          onPress={onDelete}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`${t('coach.builder.deleteDay')}: ${day.dayName}`}
          style={styles.iconButton}
        >
          <Trash2 size={18} color={theme.colors.error} />
        </Pressable>
      </View>

      {expanded && (
        <View style={styles.dayBody}>
          {exercises.isLoading ? (
            <SkeletonList count={2} height={44} />
          ) : exercises.isError ? (
            <ErrorState
              message={getApiErrorMessage(exercises.error, t('coach.programs.loadFailed'))}
              onRetry={() => exercises.refetch()}
            />
          ) : rows.length === 0 ? (
            <Text style={styles.hint}>{t('coach.builder.noExercises')}</Text>
          ) : (
            rows.map((row, position) => (
              <View key={row.id} style={styles.exercise}>
                <View style={styles.exerciseText}>
                  <Text style={styles.exerciseName} numberOfLines={1}>
                    {row.exercise?.name ?? t('coach.builder.exercises')}
                  </Text>
                  <Text style={styles.exerciseMeta}>
                    {[
                      `${row.sets} × ${row.reps ?? '—'}`,
                      row.restSeconds != null ? `${row.restSeconds}s` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                  {row.notes ? (
                    <Text style={styles.exerciseNote} numberOfLines={2}>
                      {row.notes}
                    </Text>
                  ) : null}
                </View>

                <ReorderButtons
                  canMoveUp={position > 0}
                  canMoveDown={position < rows.length - 1}
                  onMoveUp={() => moveExercise(position, -1)}
                  onMoveDown={() => moveExercise(position, 1)}
                  itemLabel={row.exercise?.name ?? ''}
                />

                <Pressable
                  onPress={() => confirmRemoveExercise(row.id, row.exercise?.name ?? '')}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t('coach.builder.removeExercise')}
                  style={styles.iconButton}
                >
                  <Trash2 size={16} color={theme.colors.error} />
                </Pressable>
              </View>
            ))
          )}

          <Button
            title={t('coach.builder.addExercise')}
            variant="outline"
            size="sm"
            onPress={() => setIsPicking(true)}
            style={styles.addExercise}
          />
        </View>
      )}

      <ExercisePicker
        visible={isPicking}
        onClose={() => {
          setIsPicking(false);
          setPickerError(undefined);
        }}
        isSubmitting={addExercise.isPending}
        error={pickerError}
        onSubmit={(payload) =>
          addExercise.mutate(payload, {
            onSuccess: () => {
              setIsPicking(false);
              setPickerError(undefined);
            },
            onError: (error) =>
              setPickerError(getApiErrorMessage(error, t('coach.programs.saveFailed'))),
          })
        }
      />
    </View>
  );
};

export default function CoachProgramBuilderScreen() {
  const { planId } = useLocalSearchParams<{ planId: string }>();
  const { styles, theme } = useStyles(stylesheet);
  const { t } = useTranslation();
  const navigation = useNavigation();

  const program = useCoachProgram(planId);

  const addWeek = useAddWeek(planId);
  const deleteWeek = useDeleteWeek(planId);
  const reorderWeeks = useReorderWeeks(planId);
  const addDay = useAddDay(planId);
  const deleteDay = useDeleteDay(planId);
  const reorderDays = useReorderDays(planId);
  const publishProgram = usePublishProgram(planId);
  const archiveProgram = useArchiveProgram(planId);
  const deleteProgram = useDeleteProgram();

  const [dayWeekId, setDayWeekId] = useState<string | null>(null);
  const [dayName, setDayName] = useState('');
  const [dayError, setDayError] = useState<string | undefined>();

  useEffect(() => {
    if (program.data?.name) navigation.setOptions({ title: program.data.name });
  }, [navigation, program.data?.name]);

  const weeks: ProgramWeek[] = program.data?.weeks ?? [];

  const moveWeek = (index: number, direction: -1 | 1) => {
    const order = movedIds(weeks, index, direction);
    if (order) reorderWeeks.mutate(order);
  };

  const moveDay = (week: ProgramWeek, index: number, direction: -1 | 1) => {
    const order = movedIds(week.days, index, direction);
    if (order) reorderDays.mutate({ weekId: week.id, dayIds: order });
  };

  const confirmDeleteWeek = (week: ProgramWeek) => {
    showAlert(t('coach.builder.deleteWeek'), t('coach.builder.week', { number: week.weekNumber }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.remove'),
        style: 'destructive',
        onPress: () => deleteWeek.mutate(week.id),
      },
    ]);
  };

  const confirmDeleteDay = (week: ProgramWeek, day: ProgramDay) => {
    showAlert(t('coach.builder.deleteDay'), day.dayName, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.remove'),
        style: 'destructive',
        onPress: () => deleteDay.mutate({ weekId: week.id, dayId: day.id }),
      },
    ]);
  };

  const submitDay = () => {
    const trimmed = dayName.trim();
    if (!dayWeekId) return;
    if (trimmed.length === 0) {
      setDayError(t('coach.common.required'));
      return;
    }

    addDay.mutate(
      { weekId: dayWeekId, dayName: trimmed },
      {
        onSuccess: () => {
          setDayWeekId(null);
          setDayName('');
          setDayError(undefined);
        },
        onError: (error) => setDayError(getApiErrorMessage(error, t('coach.programs.saveFailed'))),
      },
    );
  };

  const handlePublish = () => {
    // The API refuses to publish an empty program; say so before spending the
    // request, since "add a week" is the actual next step either way.
    if (weeks.length === 0) {
      showAlert(t('coach.programs.publish'), t('coach.programs.publishNeedsWeek'));
      return;
    }
    publishProgram.mutate(undefined, {
      onError: (error) =>
        showAlert(
          t('coach.programs.publish'),
          getApiErrorMessage(error, t('coach.programs.saveFailed')),
        ),
    });
  };

  const handleDeleteProgram = () => {
    showAlert(t('coach.programs.delete'), t('coach.programs.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.remove'),
        style: 'destructive',
        onPress: () =>
          deleteProgram.mutate(planId, {
            onSuccess: () => router.replace('/(coach)/programs'),
            onError: (error) =>
              showAlert(
                t('coach.programs.delete'),
                getApiErrorMessage(error, t('coach.programs.saveFailed')),
              ),
          }),
      },
    ]);
  };

  if (program.isLoading) {
    return (
      <ScreenContainer>
        <SkeletonList count={4} height={96} />
      </ScreenContainer>
    );
  }

  if (program.isError || !program.data) {
    return (
      <ScreenContainer>
        <ErrorState
          message={getApiErrorMessage(program.error, t('coach.programs.loadFailed'))}
          onRetry={() => program.refetch()}
        />
      </ScreenContainer>
    );
  }

  const detail = program.data;

  return (
    <ScreenContainer onRefresh={() => program.refetch()} refreshing={program.isFetching}>
      <View style={styles.headerRow}>
        <Text style={styles.programName} accessibilityRole="header">
          {detail.name}
        </Text>
        <Badge
          label={t(VISIBILITY_LABEL[detail.visibility])}
          variant={VISIBILITY_VARIANT[detail.visibility]}
        />
      </View>

      {detail.description ? <Text style={styles.description}>{detail.description}</Text> : null}

      <View style={styles.programActions}>
        {detail.visibility !== 'published' && (
          <Button
            title={t('coach.programs.publish')}
            size="sm"
            loading={publishProgram.isPending}
            onPress={handlePublish}
            style={styles.programAction}
          />
        )}
        {detail.visibility === 'published' && (
          <Button
            title={t('coach.programs.archive')}
            size="sm"
            variant="outline"
            loading={archiveProgram.isPending}
            onPress={() => archiveProgram.mutate()}
            style={styles.programAction}
          />
        )}
        <Button
          title={t('coach.programs.delete')}
          size="sm"
          variant="outline"
          loading={deleteProgram.isPending}
          onPress={handleDeleteProgram}
          style={styles.programAction}
        />
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {t('coach.builder.weeks')}
        </Text>
        <Pressable
          onPress={() => addWeek.mutate({})}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('coach.builder.addWeek')}
          style={styles.addWeek}
          testID="coach-add-week"
        >
          <Plus size={20} color={theme.colors.onPrimary} />
        </Pressable>
      </View>

      {weeks.length === 0 ? (
        <EmptyState
          icon={<Plus size={32} color={theme.colors.primary} />}
          title={t('coach.builder.noWeeks')}
          description={t('coach.programs.emptyBody')}
          actionLabel={t('coach.builder.addWeek')}
          onAction={() => addWeek.mutate({})}
        />
      ) : (
        weeks.map((week, index) => (
          <View key={week.id} style={styles.week}>
            <View style={styles.weekHeader}>
              <View style={styles.weekHeading}>
                <Text style={styles.weekTitle}>
                  {t('coach.builder.week', { number: week.weekNumber })}
                </Text>
                {week.title ? (
                  <Text style={styles.weekSubtitle} numberOfLines={1}>
                    {week.title}
                  </Text>
                ) : null}
              </View>

              <ReorderButtons
                canMoveUp={index > 0}
                canMoveDown={index < weeks.length - 1}
                onMoveUp={() => moveWeek(index, -1)}
                onMoveDown={() => moveWeek(index, 1)}
                itemLabel={t('coach.builder.week', { number: week.weekNumber })}
              />

              <Pressable
                onPress={() => confirmDeleteWeek(week)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('coach.builder.deleteWeek')}
                style={styles.iconButton}
              >
                <Trash2 size={18} color={theme.colors.error} />
              </Pressable>
            </View>

            {week.days.length === 0 ? (
              <Text style={styles.hint}>{t('coach.builder.noDays')}</Text>
            ) : (
              week.days.map((day, dayIndex) => (
                <DaySection
                  key={day.id}
                  planId={planId}
                  day={day}
                  index={dayIndex}
                  dayCount={week.days.length}
                  onMove={(direction) => moveDay(week, dayIndex, direction)}
                  onDelete={() => confirmDeleteDay(week, day)}
                />
              ))
            )}

            <Button
              title={t('coach.builder.addDay')}
              variant="outline"
              size="sm"
              onPress={() => {
                setDayWeekId(week.id);
                setDayName('');
                setDayError(undefined);
              }}
              style={styles.addDay}
            />
          </View>
        ))
      )}

      <Modal visible={dayWeekId !== null} onClose={() => setDayWeekId(null)}>
        <Text style={styles.modalTitle} accessibilityRole="header">
          {t('coach.builder.addDay')}
        </Text>
        <Input
          label={t('coach.builder.dayName')}
          placeholder={t('coach.builder.dayNamePlaceholder')}
          value={dayName}
          onChangeText={(value) => {
            setDayName(value);
            if (dayError) setDayError(undefined);
          }}
          error={dayError}
          autoFocus
        />
        <Button
          title={t('coach.builder.addDay')}
          onPress={submitDay}
          loading={addDay.isPending}
          style={styles.submit}
        />
      </Modal>
    </ScreenContainer>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  programName: { ...theme.typography.headingLg, color: theme.colors.text, flexShrink: 1 },
  description: {
    ...theme.typography.bodySm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  programActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  programAction: { flexGrow: 1, flexBasis: 110 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.md,
  },
  sectionTitle: { ...theme.typography.headingMd, color: theme.colors.text },
  addWeek: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  week: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  weekHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  weekHeading: { flex: 1 },
  weekTitle: { ...theme.typography.headingSm, color: theme.colors.text },
  weekSubtitle: {
    ...theme.typography.bodyXs,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  day: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  dayToggle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    minHeight: 44,
  },
  dayName: { ...theme.typography.bodyMd, color: theme.colors.text, flexShrink: 1 },
  dayBody: { paddingLeft: theme.spacing.md, paddingTop: theme.spacing.sm },
  exercise: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  exerciseText: { flex: 1 },
  exerciseName: { ...theme.typography.bodySm, color: theme.colors.text },
  exerciseMeta: { ...theme.typography.bodyXs, color: theme.colors.textSecondary, marginTop: 2 },
  exerciseNote: {
    ...theme.typography.bodyXs,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
    marginTop: 2,
  },
  addExercise: { marginTop: theme.spacing.sm, alignSelf: 'flex-start' },
  addDay: { marginTop: theme.spacing.md, alignSelf: 'flex-start' },
  iconButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    ...theme.typography.bodySm,
    color: theme.colors.textSecondary,
    paddingVertical: theme.spacing.sm,
  },
  modalTitle: {
    ...theme.typography.headingLg,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  submit: { marginTop: theme.spacing.lg },
}));
