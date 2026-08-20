import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Switch, Pressable } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { X } from 'lucide-react-native';
import { ScreenContainer } from '../../src/components/layout/ScreenContainer';
import { Badge, Button, Chip, ErrorState, Input, SkeletonList } from '../../src/components/ui';
import {
  useCoachProfile,
  useUpdateCoachProfile,
} from '../../src/features/coaching/api/useCoachProfile';
import type {
  CoachProfile,
  CoachVerificationStatus,
  UpdateCoachProfilePayload,
} from '../../src/features/coaching/types';
import type {
  EquipmentSlug,
  ExperienceLevel,
  FitnessGoal,
  TrainingLocation,
} from '../../src/features/users/types';
import { useLogout } from '../../src/features/auth/api/useLogout';
import { getApiErrorMessage } from '../../src/lib/api';
import { showAlert } from '../../src/lib/alert';
import { useTranslation, type TranslationKey } from '../../src/i18n';

const GOALS: FitnessGoal[] = ['weight_loss', 'muscle_gain', 'maintenance', 'endurance'];
const LEVELS: ExperienceLevel[] = ['beginner', 'intermediate', 'advanced'];
const LOCATIONS: TrainingLocation[] = ['home', 'gym', 'outdoors'];
const EQUIPMENT: EquipmentSlug[] = [
  'bodyweight',
  'pull-up-bar',
  'parallel-bars',
  'dumbbells',
  'barbell',
  'kettlebell',
  'resistance-bands',
  'bench',
  'gym-access',
];

const GOAL_LABEL: Record<FitnessGoal, TranslationKey> = {
  weight_loss: 'onboarding.goal.loseWeight',
  muscle_gain: 'onboarding.goal.buildMuscle',
  maintenance: 'onboarding.goal.keepFit',
  endurance: 'onboarding.goal.endurance',
};

const LEVEL_LABEL: Record<ExperienceLevel, TranslationKey> = {
  beginner: 'onboarding.experience.beginner',
  intermediate: 'onboarding.experience.intermediate',
  advanced: 'onboarding.experience.advanced',
};

const LOCATION_LABEL: Record<TrainingLocation, TranslationKey> = {
  home: 'onboarding.location.home',
  gym: 'onboarding.location.gym',
  outdoors: 'onboarding.location.outdoors',
};

const EQUIPMENT_LABEL: Record<EquipmentSlug, TranslationKey> = {
  bodyweight: 'onboarding.equipment.bodyweight',
  'pull-up-bar': 'onboarding.equipment.pullUpBar',
  'parallel-bars': 'onboarding.equipment.parallelBars',
  dumbbells: 'onboarding.equipment.dumbbells',
  barbell: 'onboarding.equipment.barbell',
  kettlebell: 'onboarding.equipment.kettlebell',
  'resistance-bands': 'onboarding.equipment.bands',
  bench: 'onboarding.equipment.bench',
  'gym-access': 'onboarding.equipment.fullGym',
};

const STATUS_LABEL: Record<CoachVerificationStatus, TranslationKey> = {
  verified: 'coach.profile.verified',
  pending: 'coach.profile.pending',
  rejected: 'coach.profile.rejected',
};

const STATUS_VARIANT: Record<CoachVerificationStatus, 'default' | 'success' | 'warning'> = {
  verified: 'success',
  pending: 'warning',
  rejected: 'default',
};

/** The editable slice of the profile, as strings so inputs stay controlled. */
interface FormState {
  headline: string;
  bio: string;
  yearsExperience: string;
  monthlyPrice: string;
  responseTimeHours: string;
  clientCapacity: string;
  acceptingClients: boolean;
  specialties: string[];
  supportedGoals: FitnessGoal[];
  supportedLevels: ExperienceLevel[];
  trainingLocations: TrainingLocation[];
  supportedEquipment: EquipmentSlug[];
}

const toForm = (profile: CoachProfile): FormState => ({
  headline: profile.headline ?? '',
  bio: profile.bio ?? '',
  yearsExperience: profile.yearsExperience?.toString() ?? '',
  // Cents on the wire, whole currency units in the field.
  monthlyPrice: profile.monthlyPriceCents != null ? String(profile.monthlyPriceCents / 100) : '',
  responseTimeHours: profile.responseTimeHours?.toString() ?? '',
  clientCapacity: profile.clientCapacity?.toString() ?? '',
  acceptingClients: profile.acceptingClients,
  specialties: profile.specialties ?? [],
  supportedGoals: profile.supportedGoals ?? [],
  supportedLevels: profile.supportedLevels ?? [],
  trainingLocations: profile.trainingLocations ?? [],
  supportedEquipment: profile.supportedEquipment ?? [],
});

const sameSet = (a: string[], b: string[]): boolean =>
  a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');

/**
 * Only what actually changed.
 *
 * `PATCH /coaches/me` rejects an empty body, and sending every field back would
 * overwrite anything edited elsewhere between load and save. A blank numeric
 * field means "clear it", which the API expresses as `null` for capacity and as
 * an omitted key for the rest.
 */
const buildProfileDiff = (initial: FormState, current: FormState): UpdateCoachProfilePayload => {
  const diff: UpdateCoachProfilePayload = {};

  if (current.headline.trim() !== initial.headline.trim()) diff.headline = current.headline.trim();
  if (current.bio.trim() !== initial.bio.trim()) diff.bio = current.bio.trim();

  if (current.yearsExperience !== initial.yearsExperience && current.yearsExperience.trim()) {
    diff.yearsExperience = Number(current.yearsExperience);
  }
  if (current.monthlyPrice !== initial.monthlyPrice && current.monthlyPrice.trim()) {
    diff.monthlyPriceCents = Math.round(Number(current.monthlyPrice) * 100);
  }
  if (current.responseTimeHours !== initial.responseTimeHours && current.responseTimeHours.trim()) {
    diff.responseTimeHours = Number(current.responseTimeHours);
  }
  if (current.clientCapacity !== initial.clientCapacity) {
    // Capacity is explicitly nullable — an empty box means "no limit".
    diff.clientCapacity = current.clientCapacity.trim() ? Number(current.clientCapacity) : null;
  }

  if (current.acceptingClients !== initial.acceptingClients) {
    diff.acceptingClients = current.acceptingClients;
  }

  if (!sameSet(current.specialties, initial.specialties)) diff.specialties = current.specialties;
  if (!sameSet(current.supportedGoals, initial.supportedGoals)) {
    diff.supportedGoals = current.supportedGoals;
  }
  if (!sameSet(current.supportedLevels, initial.supportedLevels)) {
    diff.supportedLevels = current.supportedLevels;
  }
  if (!sameSet(current.trainingLocations, initial.trainingLocations)) {
    diff.trainingLocations = current.trainingLocations;
  }
  if (!sameSet(current.supportedEquipment, initial.supportedEquipment)) {
    diff.supportedEquipment = current.supportedEquipment;
  }

  return diff;
};

export default function CoachProfileScreen() {
  const { styles, theme } = useStyles(stylesheet);
  const { t } = useTranslation();

  const profile = useCoachProfile();
  const updateProfile = useUpdateCoachProfile();
  const logout = useLogout();

  const [initial, setInitial] = useState<FormState | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [specialtyDraft, setSpecialtyDraft] = useState('');
  const [error, setError] = useState<string | undefined>();

  // Re-seed whenever the server's copy changes, including after a save.
  useEffect(() => {
    if (!profile.data) return;
    const next = toForm(profile.data);
    setInitial(next);
    setForm(next);
  }, [profile.data]);

  const diff = useMemo(
    () => (initial && form ? buildProfileDiff(initial, form) : {}),
    [initial, form],
  );
  const isDirty = Object.keys(diff).length > 0;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((previous) => (previous ? { ...previous, [key]: value } : previous));
    if (error) setError(undefined);
  };

  const toggle = <T extends string>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

  const addSpecialty = () => {
    const trimmed = specialtyDraft.trim();
    if (!trimmed || !form) return;
    if (form.specialties.includes(trimmed)) {
      setSpecialtyDraft('');
      return;
    }
    set('specialties', [...form.specialties, trimmed]);
    setSpecialtyDraft('');
  };

  const save = () => {
    if (!isDirty) {
      setError(t('coach.profile.noChanges'));
      return;
    }
    updateProfile.mutate(diff, {
      onError: (mutationError) =>
        setError(getApiErrorMessage(mutationError, t('coach.profile.saveFailed'))),
    });
  };

  const confirmSignOut = () => {
    showAlert(t('coach.profile.signOut'), '', [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('coach.profile.signOut'),
        style: 'destructive',
        onPress: () => logout.mutate(),
      },
    ]);
  };

  if (profile.isLoading || !form) {
    return (
      <ScreenContainer insideTabs>
        <SkeletonList count={5} height={72} />
      </ScreenContainer>
    );
  }

  if (profile.isError) {
    return (
      <ScreenContainer insideTabs>
        <ErrorState
          message={getApiErrorMessage(profile.error, t('coach.profile.loadFailed'))}
          onRetry={() => profile.refetch()}
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer
      insideTabs
      onRefresh={() => profile.refetch()}
      refreshing={profile.isFetching}
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title} accessibilityRole="header">
            {t('coach.profile.title')}
          </Text>
          <Text style={styles.subtitle}>{t('coach.profile.tagline')}</Text>
        </View>
        {profile.data && (
          <Badge
            label={t(STATUS_LABEL[profile.data.verificationStatus])}
            variant={STATUS_VARIANT[profile.data.verificationStatus]}
          />
        )}
      </View>

      <Text style={styles.section} accessibilityRole="header">
        {t('coach.profile.sectionAbout')}
      </Text>
      <Input
        label={t('coach.profile.headline')}
        value={form.headline}
        onChangeText={(value) => set('headline', value)}
      />
      <Input
        label={t('coach.profile.bio')}
        value={form.bio}
        onChangeText={(value) => set('bio', value)}
        multiline
      />
      <Input
        label={t('coach.profile.experience')}
        value={form.yearsExperience}
        onChangeText={(value) => set('yearsExperience', value)}
        keyboardType="number-pad"
      />

      <Text style={styles.section} accessibilityRole="header">
        {t('coach.profile.sectionCoaching')}
      </Text>

      <Text style={styles.fieldLabel}>{t('coach.profile.specialties')}</Text>
      {form.specialties.length > 0 && (
        <View style={styles.chipRow}>
          {form.specialties.map((specialty) => (
            <Pressable
              key={specialty}
              onPress={() =>
                set(
                  'specialties',
                  form.specialties.filter((item) => item !== specialty),
                )
              }
              accessibilityRole="button"
              accessibilityLabel={`${t('common.remove')}: ${specialty}`}
              hitSlop={6}
              style={styles.specialty}
            >
              <Text style={styles.specialtyText}>{specialty}</Text>
              <X size={14} color={theme.colors.textSecondary} />
            </Pressable>
          ))}
        </View>
      )}
      <View style={styles.specialtyAdd}>
        <View style={styles.specialtyInput}>
          <Input
            label={t('coach.profile.addSpecialty')}
            value={specialtyDraft}
            onChangeText={setSpecialtyDraft}
            onSubmitEditing={addSpecialty}
            returnKeyType="done"
          />
        </View>
        <Button
          title={t('common.done')}
          size="sm"
          variant="outline"
          onPress={addSpecialty}
          style={styles.specialtyButton}
        />
      </View>

      <Text style={styles.fieldLabel}>{t('coach.profile.goals')}</Text>
      <View style={styles.chipRow}>
        {GOALS.map((goal) => (
          <Chip
            key={goal}
            label={t(GOAL_LABEL[goal])}
            selected={form.supportedGoals.includes(goal)}
            onPress={() => set('supportedGoals', toggle(form.supportedGoals, goal))}
          />
        ))}
      </View>

      <Text style={styles.fieldLabel}>{t('coach.profile.levels')}</Text>
      <View style={styles.chipRow}>
        {LEVELS.map((level) => (
          <Chip
            key={level}
            label={t(LEVEL_LABEL[level])}
            selected={form.supportedLevels.includes(level)}
            onPress={() => set('supportedLevels', toggle(form.supportedLevels, level))}
          />
        ))}
      </View>

      <Text style={styles.fieldLabel}>{t('coach.profile.locations')}</Text>
      <View style={styles.chipRow}>
        {LOCATIONS.map((location) => (
          <Chip
            key={location}
            label={t(LOCATION_LABEL[location])}
            selected={form.trainingLocations.includes(location)}
            onPress={() => set('trainingLocations', toggle(form.trainingLocations, location))}
          />
        ))}
      </View>

      <Text style={styles.fieldLabel}>{t('coach.profile.equipment')}</Text>
      <View style={styles.chipRow}>
        {EQUIPMENT.map((slug) => (
          <Chip
            key={slug}
            label={t(EQUIPMENT_LABEL[slug])}
            selected={form.supportedEquipment.includes(slug)}
            onPress={() => set('supportedEquipment', toggle(form.supportedEquipment, slug))}
          />
        ))}
      </View>

      <Text style={styles.section} accessibilityRole="header">
        {t('coach.profile.sectionAvailability')}
      </Text>
      <Input
        label={t('coach.profile.price')}
        value={form.monthlyPrice}
        onChangeText={(value) => set('monthlyPrice', value)}
        keyboardType="decimal-pad"
      />
      <Input
        label={t('coach.profile.responseTime')}
        value={form.responseTimeHours}
        onChangeText={(value) => set('responseTimeHours', value)}
        keyboardType="number-pad"
      />
      <Input
        label={t('coach.profile.capacity')}
        value={form.clientCapacity}
        onChangeText={(value) => set('clientCapacity', value)}
        keyboardType="number-pad"
      />

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>{t('coach.profile.acceptingClients')}</Text>
        <Switch
          value={form.acceptingClients}
          onValueChange={(value) => set('acceptingClients', value)}
          trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
          accessibilityLabel={t('coach.profile.acceptingClients')}
        />
      </View>

      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}

      <Button
        title={updateProfile.isSuccess && !isDirty ? t('coach.profile.saved') : t('common.save')}
        onPress={save}
        loading={updateProfile.isPending}
        disabled={!isDirty}
        style={styles.save}
      />

      <Button
        title={t('coach.profile.signOut')}
        variant="outline"
        onPress={confirmSignOut}
        loading={logout.isPending}
        style={styles.signOut}
      />
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
  section: {
    ...theme.typography.headingSm,
    color: theme.colors.text,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  fieldLabel: {
    ...theme.typography.labelSm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  specialty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    minHeight: 36,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surfaceElevated,
  },
  specialtyText: { ...theme.typography.bodySm, color: theme.colors.text },
  specialtyAdd: { flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.sm },
  specialtyInput: { flex: 1 },
  specialtyButton: { marginBottom: theme.spacing.md },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    minHeight: 48,
    marginTop: theme.spacing.sm,
  },
  switchLabel: { ...theme.typography.bodyMd, color: theme.colors.text, flexShrink: 1 },
  error: {
    ...theme.typography.bodySm,
    color: theme.colors.error,
    marginTop: theme.spacing.md,
  },
  save: { marginTop: theme.spacing.lg },
  signOut: { marginTop: theme.spacing.sm },
}));
