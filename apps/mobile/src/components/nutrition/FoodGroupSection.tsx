import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { ChevronDown, ChevronRight } from 'lucide-react-native';
import { FoodResultCard } from './FoodResultCard';
import type { FoodGroup, FoodItem } from '../../features/nutrition/types';

interface FoodGroupSectionProps {
  group: FoodGroup;
  onSelect: (food: FoodItem) => void;
  onToggleFavorite?: (food: FoodItem) => void;
}

/** How many variants show before the group needs expanding. */
const COLLAPSED_ITEMS = 3;

/**
 * A family of foods under one header — "🥚 Eggs" over whole, white, yolk, fried.
 *
 * Searching "egg" legitimately matches a dozen rows; flat, that buries whatever
 * the user actually wanted. The first few variants stay visible so the common
 * choice needs no extra tap, and the rest are one tap away.
 */
export const FoodGroupSection: React.FC<FoodGroupSectionProps> = ({
  group,
  onSelect,
  onToggleFavorite,
}) => {
  const { styles, theme } = useStyles(stylesheet);
  const [expanded, setExpanded] = useState(false);

  // Counted off what is actually here. `group.count` is the family's true size
  // and is what the badge shows; deriving "N more" from it instead would promise
  // rows that were never sent.
  const hidden = group.items.length - COLLAPSED_ITEMS;
  const visible = expanded ? group.items : group.items.slice(0, COLLAPSED_ITEMS);

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.emoji}>{group.emoji}</Text>
        <Text style={styles.label}>{group.label}</Text>
        <Text style={styles.count}>{group.count}</Text>
      </View>

      {visible.map((item, index) => (
        <View key={item.id}>
          {index > 0 && <View style={styles.separator} />}
          <FoodResultCard
            food={item}
            nested
            onPress={() => onSelect(item)}
            onToggleFavorite={onToggleFavorite}
          />
        </View>
      ))}

      {hidden > 0 && (
        <Pressable
          style={styles.toggle}
          onPress={() => setExpanded((previous) => !previous)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={
            expanded ? `Collapse ${group.label}` : `Show ${hidden} more ${group.label}`
          }
        >
          {expanded ? (
            <ChevronDown size={14} color={theme.colors.primary} />
          ) : (
            <ChevronRight size={14} color={theme.colors.primary} />
          )}
          <Text style={styles.toggleText}>
            {expanded ? 'Show less' : `${hidden} more`}
          </Text>
        </Pressable>
      )}
    </View>
  );
};

const stylesheet = createStyleSheet((theme) => ({
  section: {
    marginBottom: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  emoji: { fontSize: 18, lineHeight: 22 },
  label: { flex: 1, color: theme.colors.text, ...theme.typography.labelMd },
  count: {
    color: theme.colors.textSecondary,
    ...theme.typography.bodyXs,
    backgroundColor: theme.colors.surfaceElevated,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.full,
    overflow: 'hidden',
  },
  separator: { height: 1, backgroundColor: theme.colors.border, marginLeft: theme.spacing.lg },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
    paddingLeft: theme.spacing.lg,
  },
  toggleText: { color: theme.colors.primary, ...theme.typography.labelSm },
}));
