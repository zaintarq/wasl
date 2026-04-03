import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Shield } from 'lucide-react-native';
import { tokens } from '../../tokens';
import { RetroCard } from '../RetroCard.native';
import { LiveContentWidth } from './LiveContentWidth.native';
import { LiveText } from './LiveTypography.native';

export function LiveSafetyNote() {
  return (
    <LiveContentWidth style={styles.marginBottom}>
      <RetroCard variant="panel" style={styles.card}>
        <View style={styles.row}>
          <View style={styles.iconWrap}>
            <Shield size={20} color={tokens.colors.green} strokeWidth={2} />
          </View>
          <View style={styles.textWrap}>
            <LiveText style={styles.title}>Safety first</LiveText>
            <LiveText style={styles.body}>
              Never share passwords, addresses, or payments. Report problems from Settings — block people from your
              profile.
            </LiveText>
          </View>
        </View>
      </RetroCard>
    </LiveContentWidth>
  );
}

const styles = StyleSheet.create({
  marginBottom: { marginBottom: tokens.spacing.md },
  card: { padding: tokens.spacing.md },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: tokens.colors.filterBgEmerald,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: tokens.colors.filterBorderEmerald,
  },
  textWrap: { flex: 1 },
  title: { ...tokens.typography.label, color: tokens.colors.text, marginBottom: 4 },
  body: { ...tokens.typography.bodySmall, color: tokens.colors.textSecondary, lineHeight: 20 },
});
