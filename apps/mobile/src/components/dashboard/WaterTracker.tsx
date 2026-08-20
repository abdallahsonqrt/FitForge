import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { Droplet, Plus } from 'lucide-react-native';
import { formatVolume } from '../../utils/formatters';
import type { UnitPreference } from '../../store/preferencesStore';

interface WaterTrackerProps {
  /** Millilitres drunk today — the unit the API stores. */
  amountMl: number;
  goalMl: number;
  units?: UnitPreference;
  /** How much a single tap adds, for the button's accessibility label. */
  incrementMl: number;
  onAdd: () => void;
}

export const WaterTracker: React.FC<WaterTrackerProps> = ({
  amountMl,
  goalMl,
  units = 'metric',
  incrementMl,
  onAdd,
}) => {
  const { styles, theme } = useStyles(stylesheet);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.iconContainer}>
          <Droplet size={16} color={theme.colors.secondary} />
        </View>
        <Text style={styles.title}>Water</Text>
      </View>

      <View style={styles.contentRow}>
        <View style={styles.valueContainer}>
          <Text style={styles.value}>{formatVolume(amountMl, units)}</Text>
          <Text style={styles.goal}>/ {formatVolume(goalMl, units)}</Text>
        </View>

        <Pressable
          onPress={onAdd}
          style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}
          accessibilityRole="button"
          accessibilityLabel={`Add ${formatVolume(incrementMl, units)} of water`}
          hitSlop={8}
        >
          <Plus size={20} color={theme.colors.onPrimary} />
        </Pressable>
      </View>
    </View>
  );
};

const stylesheet = createStyleSheet((theme) => ({
  container: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  iconContainer: {
    backgroundColor: theme.colors.secondarySoft,
    padding: theme.spacing.xs,
    borderRadius: theme.borderRadius.sm,
  },
  title: {
    ...theme.typography.labelSm,
    color: theme.colors.textSecondary,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  valueContainer: {
    flexShrink: 1,
  },
  value: {
    ...theme.typography.headingMd,
    color: theme.colors.text,
  },
  goal: {
    ...theme.typography.bodySm,
    color: theme.colors.textSecondary,
  },
  addButton: {
    backgroundColor: theme.colors.secondary,
    width: 36,
    height: 36,
    borderRadius: theme.borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.94 }],
  },
}));
