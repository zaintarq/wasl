import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Shield } from 'lucide-react-native';
import { tokens } from '../../tokens';
import { shellStyles } from '../../styles/shellStyles.native';
import { LiveContentWidth } from '../live/LiveContentWidth.native';
import { LiveText } from '../live/LiveTypography.native';

export function ClubSafetyNote() {
  return (
    <LiveContentWidth style={styles.marginBottom}>
      <View style={shellStyles.noteRow}>
        <View style={styles.iconWrap}>
          <Shield size={20} color={tokens.colors.textOnBrand} strokeWidth={2} />
        </View>
        <View style={styles.textWrap}>
          <LiveText style={shellStyles.noteTitle}>Club guidelines</LiveText>
          <LiveText style={shellStyles.noteBody}>
            Keep it respectful in voice and chat. Admins can manage members and mic access. Report issues from Settings.
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
