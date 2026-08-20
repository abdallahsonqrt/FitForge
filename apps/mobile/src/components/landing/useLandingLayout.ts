import { useWindowDimensions } from 'react-native';

/**
 * Height of the sticky landing nav. Anchor scrolling subtracts it so a section
 * lands *below* the nav instead of behind it.
 */
export const NAV_HEIGHT = 68;

/**
 * The landing page is the one screen allowed to grow wider than the app shell.
 * `useResponsiveContent` caps app screens at a 760pt reading width, which is
 * right for a workout log and far too narrow for a marketing page.
 */
export const CONTENT_MAX_WIDTH = 1160;

/**
 * Breakpoints follow the same 600/900 vocabulary the rest of the app uses, plus
 * two stops the landing page needs on its own: the width where the inline nav
 * links clear the brand and CTA, and the width where four pricing tiers still
 * read side by side.
 */
export const useLandingLayout = () => {
  const { width } = useWindowDimensions();

  const isTablet = width >= 600;
  const isDesktop = width >= 900;

  return {
    width,
    isTablet,
    isDesktop,
    /** Enough room for three columns of prose, or for the nav links inline. */
    isWide: width >= 760,
    showInlineNav: width >= 760,
    pricingColumns: width >= 1180 ? 4 : isTablet ? 2 : 1,
    /** A fixed headline size is the one thing that looks broken on a small phone. */
    heroTitleSize: width < 380 ? 32 : !isTablet ? 38 : !isDesktop ? 46 : 56,
    /** Fixed once there is room; on phones leave the next card peeking so the
     * row reads as scrollable. */
    coachCardWidth: isTablet ? 320 : Math.min(300, width - 72),
    gutter: isTablet ? 32 : 20,
  };
};

export type LandingLayout = ReturnType<typeof useLandingLayout>;
