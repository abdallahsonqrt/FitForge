import React from 'react';
import { Pressable, View } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { useTranslation } from '../../i18n';

interface ReorderButtonsProps {
  /** Disabled at the ends of the list rather than hidden, so the row never reflows. */
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  /** Names the thing being moved, e.g. "Week 2" — read out with the action. */
  itemLabel: string;
}

/**
 * Move-up / move-down, deliberately instead of drag-and-drop.
 *
 * Dragging is a gesture only a pointing device can make: it is unreachable from a
 * keyboard and unusable with a screen reader, and every library that offers it is
 * a large dependency for a builder that reorders a handful of rows. Two buttons
 * are operable by touch, keyboard and assistive tech alike, and each one announces
 * what it will move.
 */
export const ReorderButtons: React.FC<ReorderButtonsProps> = ({
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  itemLabel,
}) => {
  const { styles, theme } = useStyles(stylesheet);
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <Pressable
        onPress={onMoveUp}
        disabled={!canMoveUp}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`${t('coach.builder.moveUp')}: ${itemLabel}`}
        accessibilityState={{ disabled: !canMoveUp }}
        style={({ pressed }) => [styles.button, pressed && styles.pressed, !canMoveUp && styles.disabled]}
      >
        <ChevronUp size={18} color={theme.colors.textSecondary} />
      </Pressable>
      <Pressable
        onPress={onMoveDown}
        disabled={!canMoveDown}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`${t('coach.builder.moveDown')}: ${itemLabel}`}
        accessibilityState={{ disabled: !canMoveDown }}
        style={({ pressed }) => [styles.button, pressed && styles.pressed, !canMoveDown && styles.disabled]}
      >
        <ChevronDown size={18} color={theme.colors.textSecondary} />
      </Pressable>
    </View>
  );
};

const stylesheet = createStyleSheet((theme) => ({
  container: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  button: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borderRadius.md,
  },
  pressed: {
    backgroundColor: theme.colors.surfaceElevated,
  },
  disabled: {
    opacity: 0.35,
  },
}));
