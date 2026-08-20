import React, { useEffect } from 'react';
import { DimensionValue, ViewStyle, StyleProp } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
} from 'react-native-reanimated';
import { useStyles } from 'react-native-unistyles';

interface SkeletonProps {
  width?: DimensionValue;
  height?: DimensionValue;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

export const Skeleton: React.FC<SkeletonProps> = ({ width, height, borderRadius, style }) => {
  const { theme } = useStyles();
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(withTiming(0.7, { duration: 800 }), withTiming(0.3, { duration: 800 })),
      -1,
      true,
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          backgroundColor: theme.colors.skeleton,
          borderRadius: borderRadius ?? theme.borderRadius.md,
        },
        animatedStyle,
        style,
      ]}
    />
  );
};

/** Stacked placeholder lines — the common "list is loading" shape. */
export const SkeletonList: React.FC<{ count?: number; height?: number; gap?: number }> = ({
  count = 3,
  height = 72,
  gap,
}) => {
  const { theme } = useStyles();
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton
          key={index}
          height={height}
          style={{ marginBottom: gap ?? theme.spacing.md }}
        />
      ))}
    </>
  );
};
