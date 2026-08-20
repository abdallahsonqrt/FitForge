import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { Dumbbell, Plus } from 'lucide-react-native';
import { ScreenContainer } from '../../src/components/layout/ScreenContainer';
import {
  Badge,
  Button,
  Chip,
  EmptyState,
  ErrorState,
  Input,
  Modal,
  SkeletonList,
} from '../../src/components/ui';
import {
  useCoachPrograms,
  useCreateProgram,
} from '../../src/features/coaching/api/useCoachPrograms';
import type { ProgramVisibility } from '../../src/features/coaching/types';
import type { ExperienceLevel } from '../../src/features/users/types';
import { getApiErrorMessage } from '../../src/lib/api';
import { useTranslation, type TranslationKey } from '../../src/i18n';

type Filter = 'all' | ProgramVisibility;

const FILTERS: Filter[] = ['all', 'draft', 'published', 'archived'];

const FILTER_LABEL: Record<Filter, TranslationKey> = {
  all: 'coach.programs.filterAll',
  draft: 'coach.programs.draft',
  published: 'coach.programs.published',
  archived: 'coach.programs.archived',
};

const VISIBILITY_VARIANT: Record<ProgramVisibility, 'default' | 'success' | 'warning'> = {
  draft: 'warning',
  published: 'success',
  archived: 'default',
};

const LEVELS: ExperienceLevel[] = ['beginner', 'intermediate', 'advanced'];

const LEVEL_LABEL: Record<ExperienceLevel, TranslationKey> = {
  beginner: 'onboarding.experience.beginner',
  intermediate: 'onboarding.experience.intermediate',
  advanced: 'onboarding.experience.advanced',
};

export default function CoachProgramsScreen() {
  const { styles, theme } = useStyles(stylesheet);
  const { t } = useTranslation();

  const [filter, setFilter] = useState<Filter>('all');
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [durationWeeks, setDurationWeeks] = useState('');
  const [difficulty, setDifficulty] = useState<ExperienceLevel | undefined>();
  const [formError, setFormError] = useState<string | undefined>();

  // The API filters server-side, so the filter is part of the query, not a
  // client-side pass over one cached list.
  const programs = useCoachPrograms(filter === 'all' ? undefined : filter);
  const createProgram = useCreateProgram();

  const items = useMemo(() => programs.data?.items ?? [], [programs.data]);

  const resetForm = () => {
    setName('');
    setDescription('');
    setDurationWeeks('');
    setDifficulty(undefined);
    setFormError(undefined);
  };

  const closeForm = () => {
    setIsCreating(false);
    resetForm();
  };

  const submit = () => {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setFormError(t('coach.common.required'));
      return;
    }

    const weeks = durationWeeks.trim() ? Number(durationWeeks) : undefined;
    if (weeks !== undefined && (!Number.isInteger(weeks) || weeks < 1)) {
      setFormError(t('coach.profile.numberRange', { min: 1, max: 52 }));
      return;
    }

    createProgram.mutate(
      {
        name: trimmed,
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(weeks !== undefined ? { durationWeeks: weeks } : {}),
        ...(difficulty ? { difficulty } : {}),
      },
      {
        onSuccess: (program) => {
          closeForm();
          // Straight into the builder: a program with no weeks cannot be
          // published, so the next step is always to add one.
          router.push(`/coach/program/${program.id}`);
        },
        onError: (error) =>
          setFormError(getApiErrorMessage(error, t('coach.programs.createFailed'))),
      },
    );
  };

  const renderBody = () => {
    if (programs.isLoading) return <SkeletonList count={4} height={104} />;

    if (programs.isError) {
      return (
        <ErrorState
          message={getApiErrorMessage(programs.error, t('coach.programs.loadFailed'))}
          onRetry={() => programs.refetch()}
        />
      );
    }

    if (items.length === 0) {
      return (
        <EmptyState
          icon={<Dumbbell size={32} color={theme.colors.primary} />}
          title={t('coach.programs.emptyTitle')}
          description={t('coach.programs.emptyBody')}
          actionLabel={t('coach.programs.new')}
          onAction={() => setIsCreating(true)}
        />
      );
    }

    return items.map((program) => (
      <Pressable
        key={program.id}
        testID={`coach-program-${program.id}`}
        onPress={() => router.push(`/coach/program/${program.id}`)}
        accessibilityRole="button"
        accessibilityLabel={`${program.name}, ${t(FILTER_LABEL[program.visibility])}`}
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      >
        <View style={styles.cardTop}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {program.name}
          </Text>
          <Badge
            label={t(FILTER_LABEL[program.visibility])}
            variant={VISIBILITY_VARIANT[program.visibility]}
          />
        </View>

        {program.description ? (
          <Text style={styles.cardBody} numberOfLines={2}>
            {program.description}
          </Text>
        ) : null}

        <View style={styles.cardMeta}>
          {program.durationWeeks != null && (
            <Text style={styles.metaText}>
              {t('coach.programs.weeksCount', { count: program.durationWeeks })}
            </Text>
          )}
          {program.difficulty && (
            <Text style={styles.metaText}>{t(LEVEL_LABEL[program.difficulty])}</Text>
          )}
        </View>
      </Pressable>
    ));
  };

  return (
    <ScreenContainer
      insideTabs
      onRefresh={() => programs.refetch()}
      refreshing={programs.isFetching}
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title} accessibilityRole="header">
            {t('coach.programs.title')}
          </Text>
          <Text style={styles.subtitle}>{t('coach.programs.tagline')}</Text>
        </View>
        <Pressable
          onPress={() => setIsCreating(true)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('coach.programs.new')}
          style={styles.newButton}
          testID="coach-new-program"
        >
          <Plus size={22} color={theme.colors.onPrimary} />
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
      >
        {FILTERS.map((option) => (
          <Chip
            key={option}
            label={t(FILTER_LABEL[option])}
            selected={filter === option}
            onPress={() => setFilter(option)}
          />
        ))}
      </ScrollView>

      {renderBody()}

      <Modal visible={isCreating} onClose={closeForm}>
        <Text style={styles.modalTitle} accessibilityRole="header">
          {t('coach.programs.newTitle')}
        </Text>
        <Text style={styles.modalSubtitle}>{t('coach.programs.newSubtitle')}</Text>

        <Input
          label={t('coach.programs.name')}
          placeholder={t('coach.programs.namePlaceholder')}
          value={name}
          onChangeText={(value) => {
            setName(value);
            if (formError) setFormError(undefined);
          }}
          error={formError}
          autoFocus
        />
        <Input
          label={t('coach.programs.description')}
          value={description}
          onChangeText={setDescription}
          multiline
        />
        <Input
          label={t('coach.programs.durationWeeks')}
          value={durationWeeks}
          onChangeText={setDurationWeeks}
          keyboardType="number-pad"
        />

        <Text style={styles.fieldLabel}>{t('coach.programs.difficulty')}</Text>
        <View style={styles.levelRow}>
          {LEVELS.map((level) => (
            <Chip
              key={level}
              label={t(LEVEL_LABEL[level])}
              selected={difficulty === level}
              // Tapping the chosen level again clears it — difficulty is optional.
              onPress={() => setDifficulty(difficulty === level ? undefined : level)}
            />
          ))}
        </View>

        <Button
          title={t('coach.programs.new')}
          onPress={submit}
          loading={createProgram.isPending}
          style={styles.submit}
        />
      </Modal>
    </ScreenContainer>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  headerText: { flex: 1 },
  title: { ...theme.typography.displaySm, color: theme.colors.text },
  subtitle: {
    ...theme.typography.bodyMd,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  newButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filters: {
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
    paddingRight: theme.spacing.lg,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  cardPressed: { opacity: 0.85 },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  cardTitle: { ...theme.typography.headingSm, color: theme.colors.text, flexShrink: 1 },
  cardBody: {
    ...theme.typography.bodySm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  cardMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  metaText: { ...theme.typography.bodyXs, color: theme.colors.textSecondary },
  modalTitle: { ...theme.typography.headingLg, color: theme.colors.text },
  modalSubtitle: {
    ...theme.typography.bodySm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.md,
  },
  fieldLabel: {
    ...theme.typography.labelSm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  levelRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  submit: { marginTop: theme.spacing.lg },
}));
