/**
 * Shared layout metrics.
 *
 * The tab bar height and the bottom padding of scrollable screens have to agree,
 * otherwise screens either hide content behind the bar or leave a dead strip of
 * background above it. Both sides read these values.
 */

/** Tab bar height excluding the safe-area inset: padding + icon + label. */
export const TAB_BAR_BASE_HEIGHT = 64;

/** Full tab bar height on a device with `bottomInset` of home-indicator/gesture area. */
export const tabBarHeight = (bottomInset: number): number => TAB_BAR_BASE_HEIGHT + bottomInset;
