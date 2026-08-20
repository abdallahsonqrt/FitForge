import type { TextStyle } from 'react-native';

export const tokens = {
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    '2xl': 32,
    '3xl': 48,
  },
  borderRadius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    full: 9999,
  },
  typography: {
    displayLg: { fontSize: 32, fontWeight: '700' as const },
    displayMd: { fontSize: 28, fontWeight: '700' as const },
    displaySm: { fontSize: 24, fontWeight: '700' as const },
    headingLg: { fontSize: 20, fontWeight: '600' as const },
    headingMd: { fontSize: 18, fontWeight: '600' as const },
    headingSm: { fontSize: 16, fontWeight: '600' as const },
    bodyLg: { fontSize: 16, fontWeight: '400' as const },
    bodyMd: { fontSize: 14, fontWeight: '400' as const },
    bodySm: { fontSize: 12, fontWeight: '400' as const },
    bodyXs: { fontSize: 11, fontWeight: '400' as const },
    labelLg: { fontSize: 16, fontWeight: '600' as const },
    labelMd: { fontSize: 14, fontWeight: '600' as const },
    labelSm: { fontSize: 12, fontWeight: '600' as const },
    /**
     * `fontVariant` is asserted to the mutable `TextStyle` type rather than left
     * to the outer `as const`, which would make it a *readonly* tuple. React
     * Native's `TextStyle.fontVariant` is a mutable array, so a readonly one is
     * not assignable — and because a single unusable member degrades the whole
     * inferred stylesheet type, spreading this token anywhere used to break every
     * other style in that file. The `as const` is right for the scalar tokens;
     * arrays are the exception.
     */
    numeric: {
      fontSize: 28,
      fontWeight: '700' as const,
      fontVariant: ['tabular-nums'] as TextStyle['fontVariant'],
    },
  },
} as const;