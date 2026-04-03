import { Platform, StyleSheet } from 'react-native';

/**
 * Shared with Welcome (sign up / log in) and Live “Start matching” — same look & feel.
 */
export const welcomeButtonStyles = StyleSheet.create({
  /** Rounded soft tile — not a skinny pill. */
  welcomeBtnShape: {
    alignSelf: 'stretch',
    borderRadius: 22,
    paddingVertical: 16,
    paddingHorizontal: 26,
    minHeight: 56,
  },
  welcomeBtnPrimaryShadow: {
    ...Platform.select({
      ios: {
        shadowColor: '#BE123C',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.28,
        shadowRadius: 14,
      },
      android: { elevation: 6 },
    }),
  },
  welcomeBtnLabel: {
    fontSize: 19,
    letterSpacing: 0.4,
    paddingVertical: 2,
  },
  outlineOnBlue: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 2,
    borderColor: 'rgba(37, 99, 235, 0.35)',
    ...Platform.select({
      ios: {
        shadowColor: '#1e40af',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
      },
      android: { elevation: 3 },
    }),
  },
});
