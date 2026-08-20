import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  useWindowDimensions,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

/**
 * The scroll offset of the landing page, shared straight from the scroll handler
 * so reveals run on the UI thread and scrolling never re-renders the page.
 */
const ScrollOffsetContext = createContext<SharedValue<number> | null>(null);
export const ScrollOffsetProvider = ScrollOffsetContext.Provider;

/**
 * Content offset of the nearest enclosing `Reveal`.
 *
 * A nested block cannot measure itself: `onLayout` reports a position relative
 * to its parent, which is not comparable with the scroll offset. So a nested
 * block inherits its section's position and staggers with `delay` instead.
 * `undefined` means "no section above me" — the block is a direct child of the
 * scroll content and measures itself; `null` means "a section is above me but
 * has not been measured yet", which must stay hidden rather than reveal early.
 */
const SectionTopContext = createContext<number | null | undefined>(undefined);

/** How far a block must clear the bottom edge before it counts as arrived. */
const TRIGGER_INSET = 72;
/** How far a block rises as it fades in. */
const TRAVEL = 22;

interface Props {
  children: ReactNode;
  /** Stagger against the rest of the section, in milliseconds. */
  delay?: number;
  /**
   * Anchor and measure the children without animating this block itself. Use it
   * for a section wrapper whose contents reveal individually, so the two fades
   * don't stack up and read as muddy.
   */
  group?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Reports this block's content offset — the nav's anchors are built from it. */
  onMeasure?: (y: number) => void;
}

/**
 * Fades and lifts its children in the first time they scroll into view. Blocks
 * animate once and stay put; scrolling back up does not replay them.
 */
export function Reveal({ children, delay = 0, group = false, style, onMeasure }: Props) {
  const scrollY = useContext(ScrollOffsetContext);
  const inheritedTop = useContext(SectionTopContext);
  const { height } = useWindowDimensions();
  const reducedMotion = useReducedMotion();

  const isRoot = inheritedTop === undefined;
  const [selfTop, setSelfTop] = useState<number | null>(null);
  const top = isRoot ? selfTop : inheritedTop;

  const skipAnimation = reducedMotion || scrollY === null;
  const progress = useSharedValue(skipAnimation ? 1 : 0);
  const started = useSharedValue(skipAnimation);

  useAnimatedReaction(
    () => top !== null && (scrollY?.value ?? 0) + height - TRIGGER_INSET > top,
    (arrived) => {
      if (!arrived || started.value) return;
      started.value = true;
      progress.value = withDelay(
        delay,
        withTiming(1, { duration: 460, easing: Easing.out(Easing.cubic) }),
      );
    },
    [top, height, delay],
  );

  // A block whose layout never lands would otherwise stay invisible for good.
  // The timer only covers that case — measured blocks keep their scroll reveal.
  useEffect(() => {
    if (top !== null) return;
    const timer = setTimeout(() => {
      if (started.value) return;
      started.value = true;
      progress.value = withTiming(1, { duration: 240 });
    }, 1200);
    return () => clearTimeout(timer);
  }, [top, progress, started]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * TRAVEL }],
  }));

  const handleLayout = isRoot
    ? (event: LayoutChangeEvent) => {
        const { y } = event.nativeEvent.layout;
        setSelfTop(y);
        onMeasure?.(y);
      }
    : undefined;

  return (
    <SectionTopContext.Provider value={top}>
      <Animated.View onLayout={handleLayout} style={[style, group ? null : animatedStyle]}>
        {children}
      </Animated.View>
    </SectionTopContext.Provider>
  );
}
