import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { Droplet, Footprints, Plus } from 'lucide-react-native';
import { formatVolume } from '../../utils/formatters';
import type { UnitPreference } from '../../store/preferencesStore';

interface WaterStepWidgetProps {
  /** Millilitres drunk today — the unit the API stores. */
  waterMl: number;
  waterGoalMl: number;
  /** How much a single tap adds. */
  incrementMl: number;
  units?: UnitPreference;
  steps: number;
  stepGoal: number;
  onAddWater: () => void;
}

export const WaterStepWidget: React.FC<WaterStepWidgetProps> = ({
  waterMl,
  waterGoalMl,
  incrementMl,
  units = 'metric',
  steps,
  stepGoal,
  onAddWater,
}) => {
  const { styles, theme } = useStyles(stylesheet);

  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <View style={styles.header}>
          <Droplet size={18} color={theme.colors.secondary} />
          <Text style={styles.title}>Water</Text>
        </View>
        <Text style={styles.value}>{formatVolume(waterMl, units)}</Text>
        <Text style={styles.goal}>/ {formatVolume(waterGoalMl, units)}</Text>

        <View style={styles.controls}>
          <Pressable
            onPress={onAddWater}
            accessibilityRole="button"
            accessibilityLabel={`Add ${formatVolume(incrementMl, units)} of water`}
            style={({ pressed }) => [
              styles.controlButton,
              styles.controlButtonPrimary,
              pressed && styles.controlButtonPressed,
            ]}
          >
            <Plus size={16} color={theme.colors.onPrimary} />
          </Pressable>
          <Text style={styles.incrementLabel}>+{formatVolume(incrementMl, units)}</Text>
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.section}>
        <View style={styles.header}>
          <Footprints size={18} color={theme.colors.success} />
          <Text style={styles.title}>Steps</Text>
        </View>
        <Text style={styles.value}>{steps.toLocaleString()}</Text>
        <Text style={styles.goal}>/ {stepGoal.toLocaleString()}</Text>
      </View>
    </View>
  );
};

const stylesheet = createStyleSheet((theme) => ({
  container: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
  },
  section: {
    flex: 1,
    paddingHorizontal: theme.spacing.sm,
  },
  divider: {
    width: 1,
    backgroundColor: theme.colors.border,
    marginVertical: theme.spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },
  title: {
    ...theme.typography.labelSm,
    color: theme.colors.textSecondary,
  },
  value: {
    ...theme.typography.headingLg,
    color: theme.colors.text,
  },
  goal: {
    ...theme.typography.bodySm,
    color: theme.colors.textSecondary,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  incrementLabel: {
    ...theme.typography.bodySm,
    color: theme.colors.textSecondary,
  },
  controlButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlButtonPrimary: {
    backgroundColor: theme.colors.secondary,
  },
  controlButtonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.94 }],
  },
}));
