import { Dimensions, Platform } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/** Soft pastel pink shell + rose accent. */
export const tokens = {
  colors: {
    bg: '#FBCFE8',
    bgSecondary: '#F9A8D4',
    surface: '#FFFFFF',
    surfaceElevated: '#FFFFFF',
    surfaceOverlay: '#FDF2F8',

    border: '#F9A8D4',
    borderDark: '#F472B6',

    text: '#0F172A',
    textSecondary: '#475569',
    textMuted: '#94A3B8',

    textOnBrand: '#831843',
    textMutedOnBrand: 'rgba(131, 24, 67, 0.68)',

    shellIconBtn: 'rgba(255, 255, 255, 0.55)',
    shellRowBorder: 'rgba(131, 24, 67, 0.12)',
    shellTile: 'rgba(255, 255, 255, 0.42)',
    shellTileBorder: 'rgba(131, 24, 67, 0.1)',

    glassTint: 'rgba(15, 23, 42, 0.22)',
    glassFallback: 'rgba(15, 23, 42, 0.65)',
    glassBorder: 'rgba(255, 255, 255, 0.22)',
    photoScrim: ['transparent', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.82)'],

    brandPink: '#DB2777',
    brandPinkDark: '#BE185D',
    brandPinkDeep: '#9D174D',

    accent: '#DB2777',
    accentDim: 'rgba(219, 39, 119, 0.14)',
    accentPressed: '#BE185D',

    pink: '#DB2777',
    green: '#10B981',
    greenBorder: '#059669',
    blue: '#0EA5E9',
    blueBorder: '#0284C7',
    gray: '#64748B',
    danger: '#EF4444',
    success: '#10B981',
    warning: '#F59E0B',

    filterBgRose: '#FFF1F2',
    filterBgSky: '#EFF6FF',
    filterBgViolet: '#F5F3FF',
    filterBgAmber: '#FFFBEB',
    filterBgEmerald: '#ECFDF5',
    filterBorderRose: '#FDA4AF',
    filterBorderSky: '#7DD3FC',
    filterBorderViolet: '#C4B5FD',
    filterBorderAmber: '#FCD34D',
    filterBorderEmerald: '#6EE7B7',
  },

  spacing: {
    xs: 6,
    sm: 10,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 40,
    screenHorizontal: Math.min(24, SCREEN_WIDTH * 0.06),
  },

  radius: {
    xs: 8,
    sm: 12,
    md: 16,
    lg: 20,
    xl: 28,
    full: 9999,
  },

  typography: {
    titleLarge: { fontSize: 26, fontWeight: '700', letterSpacing: -0.5 },
    title: { fontSize: 20, fontWeight: '600', letterSpacing: -0.3 },
    titleSmall: { fontSize: 17, fontWeight: '600' },
    body: { fontSize: 16, fontWeight: '400', lineHeight: 24 },
    bodySmall: { fontSize: 14, fontWeight: '400', lineHeight: 20 },
    caption: { fontSize: 12, fontWeight: '500', lineHeight: 16 },
    label: { fontSize: 13, fontWeight: '600' },
    button: { fontSize: 16, fontWeight: '600' },
  },

  shadow: {
    color: '#000000',
    offsetSm: { width: 0, height: 1 },
    offsetMd: { width: 0, height: 2 },
    opacity: 0.06,
    radius: 8,
    elevation: 3,
    elevationHigh: 8,
  },

  font: {
    heavy: '700',
    bold: '600',
    semi: '600',
  },

  isSmallDevice: SCREEN_WIDTH < 375,
  maxContentWidth: 440,

  /** Shared Reanimated spring / timing presets — keep interactions consistent app-wide. */
  motion: {
    spring: {
      jelly: { damping: 18, stiffness: 165, mass: 0.85 },
      snappy: { damping: 22, stiffness: 260, mass: 0.72 },
      soft: { damping: 20, stiffness: 180, mass: 0.9 },
    },
    timing: {
      fast: 120,
      medium: 200,
      slow: 320,
    },
  },
};

export const brandShellGradient = ['#FDF2F8', '#FBCFE8'];
export const brandShellGradientSoft = ['#FDF2F8', '#FBCFE8', '#F9A8D4'];
export const brandUnderlineGradient = ['#DB2777', '#F472B6'];
