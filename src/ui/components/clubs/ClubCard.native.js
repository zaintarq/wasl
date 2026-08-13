import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ChevronRight, Globe, Lock } from 'lucide-react-native';
import { tokens } from '../../tokens';
import { shellStyles } from '../../styles/shellStyles.native';
import { HuzzPressable } from '../HuzzPressable.native';
import { LiveText } from '../live/LiveTypography.native';

export function ClubCard({ club, joined, onPress }) {
  const isPublic = club?.isPublic !== false;
  const iconBg = isPublic ? tokens.colors.filterBgSky : tokens.colors.filterBgAmber;
  const iconColor = isPublic ? tokens.colors.blue : tokens.colors.warning;
  const Icon = isPublic ? Globe : Lock;

  return (
    <HuzzPressable style={styles.wrap} onPress={onPress} haptic="light">
      <View style={shellStyles.listRow}>
        <View style={[styles.iconCircle, { backgroundColor: iconBg }]}>
          <Icon size={22} color={iconColor} strokeWidth={2} />
        </View>

        <View style={styles.body}>
          <View style={styles.titleRow}>
            <LiveText style={styles.name} numberOfLines={1}>
              {club?.name || 'Club'}
            </LiveText>
            <View style={[styles.badge, { backgroundColor: iconBg }]}>
              <LiveText style={[styles.badgeText, { color: iconColor }]}>
                {isPublic ? 'Public' : 'Private'}
              </LiveText>
            </View>
          </View>
          <LiveText style={styles.meta} numberOfLines={2}>
            {club?.description || (isPublic ? 'Open to everyone' : 'Invite code required')}
          </LiveText>
        </View>

        <View style={styles.action}>
          <LiveText style={styles.actionText}>{joined ? 'Open' : 'Join'}</LiveText>
          <ChevronRight size={18} color={tokens.colors.textOnBrand} strokeWidth={2.5} />
        </View>
      </View>
    </HuzzPressable>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 0 },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, minWidth: 0 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  name: {
    ...tokens.typography.label,
    fontSize: 16,
    color: tokens.colors.textOnBrand,
    flexShrink: 1,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: tokens.radius.full,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  meta: {
    ...tokens.typography.caption,
    color: tokens.colors.textMutedOnBrand,
    marginTop: 4,
    lineHeight: 16,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  actionText: {
    ...tokens.typography.label,
    color: tokens.colors.textOnBrand,
  },
});
