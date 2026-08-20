import { tokens } from './tokens';

export const darkTheme = {
  colors: {
    background: '#0A0A0F',
    surface: '#141420',
    surfaceElevated: '#1E1E2E',
    primary: '#6C5CE7',
    primaryGlow: '#A29BFE',
    /** Low-opacity primary, for tinted chips/badges/backgrounds. */
    primarySoft: 'rgba(108, 92, 231, 0.18)',
    secondary: '#00D2FF',
    secondarySoft: 'rgba(0, 210, 255, 0.16)',
    success: '#00E676',
    successSoft: 'rgba(0, 230, 118, 0.16)',
    warning: '#FFAB40',
    warningSoft: 'rgba(255, 171, 64, 0.16)',
    error: '#FF5252',
    errorSoft: 'rgba(255, 82, 82, 0.16)',
    text: '#F8FAFC',
    textSecondary: '#94A3B8',
    textTertiary: '#64748B',
    /** Text that sits on top of a filled `primary` surface. */
    onPrimary: '#FFFFFF',
    /**
     * Foreground for a filled `success` surface. Dark rather than white: the
     * success green is bright in both themes, so white on it lands at ~1.7:1
     * while this ink clears 10:1.
     */
    onSuccess: '#0F172A',
    border: '#2D2D44',
    overlay: 'rgba(0, 0, 0, 0.6)',
    skeleton: '#1E1E2E',
  },
  shadows: {
    sm: {
      shadowColor: '#000000',
      shadowOpacity: 0.35,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    md: {
      shadowColor: '#000000',
      shadowOpacity: 0.45,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
  },
  ...tokens,
} as const;
