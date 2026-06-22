// Brought into line with the Upande Production design system so the two apps
// look identical in the field. COLORS keeps its original keys for backwards
// compatibility — new code should use the type/fontFamily exports below.

export const COLORS = {
  // Surfaces & text
  text: '#171717',
  textMuted: '#6B6B6B',
  textSecondary: '#525252',
  textOnPrimary: '#FFFFFF',
  border: '#E5E5E5',
  bg: '#FFFFFF',
  bgMuted: '#F5F5F5',
  surface: '#FFFFFF',
  surfaceAlt: '#F5F5F5',

  // Action / status
  primary: '#171717',
  info: '#171717',
  success: '#22C55E',
  warn: '#F59E0B',
  danger: '#EF4444',
  overlay: 'rgba(0, 0, 0, 0.4)',
} as const;

// Legacy alias kept so older files that import { colors } continue to compile
// during the refactor. New code should use COLORS.
export const colors = {
  black: COLORS.text,
  white: COLORS.bg,
  gray900: '#0A0A0A',
  gray800: '#171717',
  gray700: '#262626',
  gray600: COLORS.textMuted,
  gray500: '#737373',
  gray400: '#A3A3A3',
  gray300: COLORS.border,
  gray200: '#E5E5E5',
  gray100: COLORS.bgMuted,
  gray50: '#FAFAFA',
  success: COLORS.success,
  error: COLORS.danger,
  warning: COLORS.warn,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  pill: 9999,
};

/** Production-aligned alias of `radius`. Use `borderRadius.full` for pills. */
export const borderRadius = {
  sm: radius.sm,
  md: radius.md,
  lg: radius.lg,
  xl: 20,
  full: radius.pill,
};

export const fontFamily = {
  regular: 'DMSans_400Regular',
  medium: 'DMSans_500Medium',
  semiBold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
} as const;

export const fontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 18,
  xl: 22,
  xxl: 28,
} as const;

export const typography = {
  // Original keys (kept so existing imports compile, but now mapped to Poppins/DM Sans)
  display: { fontFamily: fontFamily.bold, fontSize: 28, color: COLORS.text },
  title: { fontFamily: fontFamily.bold, fontSize: 22, color: COLORS.text },
  heading: { fontFamily: fontFamily.semiBold, fontSize: 18, color: COLORS.text },
  body: { fontFamily: fontFamily.regular, fontSize: 15, color: COLORS.text },
  bodyBold: { fontFamily: fontFamily.semiBold, fontSize: 15, color: COLORS.text },
  caption: { fontFamily: fontFamily.regular, fontSize: 13, color: COLORS.textMuted },
  label: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    color: COLORS.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.4,
  },
  // Production-aligned aliases for new components
  h1: { fontFamily: fontFamily.bold, fontSize: fontSize.xxl, color: COLORS.text },
  h2: { fontFamily: fontFamily.bold, fontSize: fontSize.xl, color: COLORS.text },
  h3: { fontFamily: fontFamily.semiBold, fontSize: fontSize.lg, color: COLORS.text },
  bodySmall: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textSecondary },
  mono: { fontFamily: 'monospace', fontSize: fontSize.md, color: COLORS.text },
};

export const shadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
};
