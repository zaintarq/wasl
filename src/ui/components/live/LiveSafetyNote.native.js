import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Shield } from 'lucide-react-native';
import { tokens } from '../../tokens';
import { shellStyles } from '../../styles/shellStyles.native';
import { LiveContentWidth } from './LiveContentWidth.native';
import { LiveText } from './LiveTypography.native';

export function LiveSafetyNote() {
  return (
    <LiveContentWidth style={styles.marginBottom}>
      <View style={shellStyles.noteRow}>
        <View style={styles.iconWrap}>
          <Shield size={20} color={tokens.colors.textOnBrand} strokeWidth={2} />
        </View>
        <View style={styles.textWrap}>
          <LiveText style={shellStyles.noteTitle}>Stay respectful</LiveText>
          <LiveText style={shellStyles.noteBody}>
            Live is anonymous and timed. Profile and story photos are checked with Google Cloud Vision after upload. Skip or leave anytime if someone makes you uncomfortable.
          </LiveText>
        </View>
      </View>
    </LiveContentWidth>
  );
}

const styles = StyleSheet.create({
  marginBottom: { marginBottom: tokens.spacing.md },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: tokens.colors.shellIconBtn,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: { flex: 1 },
});
