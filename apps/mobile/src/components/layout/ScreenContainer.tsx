import React from 'react';
import { View, ScrollView, RefreshControl, ViewStyle, StyleProp } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { useResponsiveContent } from './useResponsiveContent';

interface ScreenContainerProps {
  children: React.ReactNode;
  scrollable?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  /**
   * Set on screens rendered inside the tab navigator. The tab bar is a sibling of
   * the screen, not an overlay, and it already consumes the bottom safe area — so
   * these screens must not add the inset again or they double-count it.
   */
  insideTabs?: boolean;
}

export const ScreenContainer: React.FC<ScreenContainerProps> = ({
  children,
  scrollable = true,
  onRefresh,
  refreshing = false,
  style,
  contentContainerStyle,
  insideTabs = false,
}) => {
  const insets = useSafeAreaInsets();
  const { styles, theme } = useStyles(stylesheet);

  const bottomSpace = insideTabs ? theme.spacing.lg : insets.bottom + theme.spacing.lg;
  // Keep content comfortably readable on tablets and web without introducing a
  // separate layout for every screen. On phones this remains full width.
  const responsiveContent = useResponsiveContent();

  if (scrollable) {
    return (
      // Only the top inset goes on the outer view. Bottom padding belongs on the
      // scroll content — on the outer view it would shorten the scroll viewport
      // and leave a dead strip of background that content can never reach.
      <View style={[styles.container, { paddingTop: insets.top }, style]}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: bottomSpace },
            responsiveContent,
            contentContainerStyle,
          ]}
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={theme.colors.primary}
                colors={[theme.colors.primary]}
                progressBackgroundColor={theme.colors.surface}
              />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        styles.content,
        { paddingTop: insets.top + theme.spacing.lg, paddingBottom: bottomSpace },
        responsiveContent,
        contentContainerStyle,
        style,
      ]}
    >
      {children}
    </View>
  );
};

const stylesheet = createStyleSheet((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.spacing.lg,
  },
}));
