import { useWindowDimensions } from 'react-native';
import { useStyles } from 'react-native-unistyles';

/**
 * The one definition of how wide a screen's content may grow and how much air it
 * gets at the sides. `ScreenContainer` applies this for the screens it wraps; the
 * few screens that can't be wrapped — a keyboard-aware chat, an active session with
 * a pinned footer — apply it directly to their own scroll content so every screen
 * still lines up at the same width.
 *
 * On phones the cap is deliberately absent: content stays full width.
 */
interface Options {
  /**
   * Leave false on screens that already set their own horizontal padding — they
   * only need the width cap, and adding padding on top would double it.
   */
  withPadding?: boolean;
}

export const useResponsiveContent = ({ withPadding = true }: Options = {}) => {
  const { width } = useWindowDimensions();
  const { theme } = useStyles();

  const contentWidth = width >= 900 ? 760 : width >= 600 ? 680 : undefined;
  const horizontalPadding = width >= 600 ? theme.spacing.xl : theme.spacing.lg;

  return {
    ...(withPadding ? { paddingHorizontal: horizontalPadding } : {}),
    ...(contentWidth
      ? { width: '100%' as const, maxWidth: contentWidth, alignSelf: 'center' as const }
      : {}),
  };
};
