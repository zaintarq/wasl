import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { tokens } from '../../../tokens';
import { VerifiedBadge } from './VerifiedBadge.native';
import { InterestChip } from './InterestChip.native';
import { VerificationCard } from './VerificationCard.native';
import { getPresenceDisplay } from '../../../../utils/presence';

export function ProfileBottomSheet({
  user,
  viewerAgeVerified,
  viewerNeedsVerify,
  onStartVerification,
  onLearnMoreVerification,
}) {
  const presence = useMemo(() => getPresenceDisplay(user?.lastSeen), [user?.lastSeen]);

  const chips = useMemo(() => {
    const items = [];
    if (user?.religion) items.push(String(user.religion));
    const interests = Array.isArray(user?.interests) ? user.interests.filter(Boolean).slice(0, 4) : [];
    items.push(...interests);
    if (items.length < 4 && user?.addMe) items.push(String(user.addMe).slice(0, 20));
    return items.slice(0, 4);
  }, [user]);

  const locationLine = [
    user?.location || user?.countryOfResidence || 'Nearby',
    user?.distance ? `${user.distance} km` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <View style={styles.sheet}>
      <View style={styles.handle} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollInner}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {user?.name || 'User'}
            {user?.age ? `, ${user.age}` : ''}
          </Text>
          {user?.isVerified || user?.ageChecked18Plus ? <VerifiedBadge size={20} /> : null}
        </View>

        <Text style={styles.location} numberOfLines={2}>
          {locationLine}
        </Text>

        {presence ? (
          <Text style={[styles.presence, presence.kind === 'online' && styles.presenceOnline]}>
            {presence.kind === 'online' ? 'Online now' : presence.label}
          </Text>
        ) : null}

        {user?.bio ? (
          <Text style={styles.bio} numberOfLines={3}>
            {user.bio}
          </Text>
        ) : null}

        {chips.length > 0 ? (
          <View style={styles.chips}>
            {chips.map((c) => (
              <InterestChip key={c} label={c} />
            ))}
          </View>
        ) : null}

        {viewerNeedsVerify ? (
          <VerificationCard variant="unverified" onStartCheck={onStartVerification} />
        ) : viewerAgeVerified ? (
          <VerificationCard variant="verified" onLearnMore={onLearnMoreVerification} />
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: tokens.colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 8,
    paddingHorizontal: 16,
    paddingBottom: 4,
    minHeight: 120,
    maxHeight: '46%',
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: tokens.colors.border,
    shadowColor: '#831843',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: tokens.colors.borderDark,
    marginBottom: 10,
  },
  scroll: { flex: 1 },
  scrollInner: { paddingBottom: 8 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  name: {
    fontSize: 22,
    fontWeight: '800',
    color: tokens.colors.text,
    letterSpacing: -0.3,
    flexShrink: 1,
  },
  location: {
    marginTop: 4,
    fontSize: 13,
    color: tokens.colors.textSecondary,
    lineHeight: 18,
  },
  presence: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '600',
    color: tokens.colors.textMuted,
  },
  presenceOnline: { color: tokens.colors.green },
  bio: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 19,
    color: tokens.colors.textSecondary,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
});
