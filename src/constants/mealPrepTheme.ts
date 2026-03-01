// Meal Prep Design Tokens
// Consolidated colors, typography, spacing, shadows for Cook Together feature

export const mpColors = {
  // Primary
  teal: '#3fa6a6',
  tealDark: '#2D8A8A',
  tealLight: '#E0F2F1',
  tealMist: '#F0FAF9',

  // Accent
  amber: '#E6930A',
  amberLight: '#FFF6E5',
  coral: '#E8725C',
  coralLight: '#FFF0ED',
  green: '#34C759',
  greenLight: '#E8F9ED',
  blue: '#3B82F6',
  blueLight: '#EFF6FF',
  purple: '#8B5CF6',
  purpleLight: '#F3EEFF',
  red: '#EF4444',
  redLight: '#FEF2F2',

  // Backgrounds
  background: '#F7F8FA',
  card: '#FFFFFF',

  // Gray scale
  gray50: '#FAFAFA',
  gray100: '#F3F4F6',
  gray200: '#E5E7EB',
  gray300: '#D1D5DB',
  gray400: '#9CA3AF',
  gray500: '#6B7280',
  gray600: '#4B5563',
  gray700: '#374151',
  gray800: '#1F2937',
  gray900: '#111827',

  white: '#FFFFFF',
  black: '#000000',
} as const;

export const mpFonts = {
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semiBold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
} as const;

export const mpSpacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const mpRadii = {
  xs: 4,
  sm: 8,
  card: 16,
  button: 12,
  input: 8,
  pill: 50,
} as const;

export const mpShadows = {
  xs: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
} as const;

// Default hero gradients for events
export const mpGradients = {
  warm: ['#FFF6E5', '#FFECD2'],
  cool: ['#E0F2F1', '#B2DFDB'],
  sunset: ['#FFF0ED', '#FFE0DB'],
  ocean: ['#EFF6FF', '#DBEAFE'],
  lavender: ['#F3EEFF', '#EDE9FE'],
  mint: ['#E8F9ED', '#D1FAE5'],
} as const;

// Available hero emojis for event creation
export const mpHeroEmojis = [
  '🍳', '🥘', '🍲', '🥗', '🌮', '🍕', '🍜', '🍖',
  '🥩', '🧁', '🎂', '🍝', '🥙', '🍱', '🍛', '🥧',
] as const;

// Recipe color palette for multi-recipe events (index 0-4)
// Each recipe in a meal plan gets a distinct color for visual identification
export const RECIPE_COLORS = [
  { name: 'coral',  color: mpColors.coral,  light: mpColors.coralLight },
  { name: 'green',  color: mpColors.green,  light: mpColors.greenLight },
  { name: 'amber',  color: mpColors.amber,  light: mpColors.amberLight },
  { name: 'purple', color: mpColors.purple, light: mpColors.purpleLight },
  { name: 'blue',   color: mpColors.blue,   light: mpColors.blueLight },
] as const;

// "Merged" badge color (for consolidated items across recipes)
export const MERGED_BADGE_COLOR = {
  color: mpColors.purple,
  light: mpColors.purpleLight,
} as const;
