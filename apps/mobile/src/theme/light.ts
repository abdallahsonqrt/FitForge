import { tokens } from './tokens';

export const lightTheme = {
  colors: {
    background: '#F8FAFC',
    surface: '#FFFFFF',
    surfaceElevated: '#F1F5F9',
    primary: '#6C5CE7',
    primaryGlow: '#A29BFE',
    /** Low-opacity primary, for tinted chips/badges/backgrounds. */
    primarySoft: 'rgba(108, 92, 231, 0.12)',
    secondary: '#0099CC',
    secondarySoft: 'rgba(0, 153, 204, 0.12)',
    success: '#00C853',
    successSoft: 'rgba(0, 200, 83, 0.12)',
    warning: '#FF9100',
    warningSoft: 'rgba(255, 145, 0, 0.12)',
    error: '#D32F2F',
    errorSoft: 'rgba(211, 47, 47, 0.12)',
    text: '#0F172A',
    textSecondary: '#64748B',
    textTertiary: '#94A3B8',
    /** Text that sits on top of a filled `primary` surface. */
    onPrimary: '#FFFFFF',
    /**
     * Foreground for a filled `success` surface. Dark rather than white: the
     * success green is bright in both themes, so white on it lands at ~2.2:1
     * while this ink clears 8:1.
     */
    onSuccess: '#0F172A',
    border: '#E2E8F0',
    overlay: 'rgba(15, 23, 42, 0.45)',
    skeleton: '#E2E8F0',
  },
  shadows: {
    sm: {
      shadowColor: '#0F172A',
      shadowOpacity: 0.06,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    md: {
      shadowColor: '#0F172A',
      shadowOpacity: 0.1,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
  },
  ...tokens,
} as const;
