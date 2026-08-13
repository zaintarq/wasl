import { Platform, StyleSheet } from 'react-native';
import { tokens } from '../tokens';

/**
 * Shared with Welcome (sign up / log in) and Live “Start matching” — same look & feel.
 */
export const welcomeButtonStyles = StyleSheet.create({
  welcomeBtnShape: {
    alignSelf: 'stretch',
    borderRadius: 22,
    paddingVertical: 16,
    paddingHorizontal: 26,
    minHeight: 56,
  },
  welcomeBtnPrimaryOnBrand: {
    backgroundColor: tokens.colors.brandPink,
    borderWidth: 0,
  },
  welcomeBtnPrimaryShadow: {
    ...Platform.select({
      ios: {
        shadowColor: tokens.colors.brandPinkDeep,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.22,
        shadowRadius: 14,
      },
      android: { elevation: 6 },
    }),
  },
  welcomeBtnLabel: {
    fontSize: 19,
    letterSpacing: 0.4,
    paddingVertical: 2,
    color: '#FFFFFF',
  },
  welcomeBtnLabelOnBrand: {
    color: '#FFFFFF',
  },
  outlineOnBrand: {
    backgroundColor: 'rgba(255,255,255,0.45)',
    borderWidth: 2,
    borderColor: tokens.colors.brandPinkDeep,
    ...Platform.select({
      ios: {
        shadowColor: tokens.colors.brandPinkDeep,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
      },
      android: { elevation: 3 },
    }),
  },
  welcomeBtnLabelOutlineOnBrand: {
    color: tokens.colors.brandPinkDeep,
  },
  outlineOnBlue: {
    backgroundColor: 'rgba(255,255,255,0.45)',
    borderWidth: 2,
    borderColor: tokens.colors.brandPinkDeep,
  },
});
