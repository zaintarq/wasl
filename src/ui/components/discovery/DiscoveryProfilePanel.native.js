import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { ScrollView as GHScrollView } from 'react-native-gesture-handler';
import { tokens } from '../../tokens';
import { ProfileVoicePlayer } from '../ProfileVoicePlayer.native';

/**
 * Fixed profile panel — stays anchored at the bottom of the stage while photos slide underneath.
 */
export function DiscoveryProfilePanel({ user }) {
  const hasAbout = useMemo(() => {
    if (!user) return false;
    return (
      !!String(user?.bio || '').trim() ||
      !!String(user?.addMe || '').trim() ||
      (Array.isArray(user?.interests) && user.interests.length > 0) ||
      !!String(user?.aboutVoiceUrl || '').trim()
    );
  }, [user]);

  if (!user) return null;

  return (
    <View style={styles.panel} pointerEvents="box-none">
      <View style={styles.card}>
        <View style={styles.rail} />
        <View style={styles.body}>
          <View style={styles.header}>
            <Text style={styles.name} numberOfLines={1}>
              {user?.name || 'User'}
              {user?.age ? `, ${user.age}` : ''}
              {user?.isVerified ? ' ✓' : ''}
            </Text>
            <Text style={styles.location} numberOfLines={1}>
              {user?.location || user?.countryOfResidence || 'Nearby'}
              {user?.distance ? ` · ${user.distance} km` : ''}
            </Text>
          </View>

          {hasAbout ? (
            <GHScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {!!String(user?.bio || '').trim() && (
                <>
                  <Text style={styles.label}>About</Text>
                  <Text style={styles.text}>{String(user.bio)}</Text>
                </>
              )}
              {!!String(user?.addMe || '').trim() && (
                <>
                  <Text style={styles.label}>Add me</Text>
                  <Text style={styles.text}>{String(user.addMe).trim()}</Text>
                </>
              )}
              {(user?.interests || []).length > 0 && (
                <>
                  <Text style={styles.label}>Interests</Text>
                  <View style={styles.tags}>
                    {(user.interests || []).slice(0, 10).map((interest, idx) => (
                      <View key={`${interest}-${idx}`} style={styles.tag}>
                        <Text style={styles.tagText}>{interest}</Text>
                      </View>
                    ))}
                  </View>
                </>
              )}
              {!!String(user?.aboutVoiceUrl || '').trim() && (
                <>
                  <Text style={styles.label}>Voice</Text>
                  <ProfileVoicePlayer
                    audioUrl={String(user.aboutVoiceUrl).trim()}
                    durationMs={user?.aboutVoiceDurationMs}
                  />
                </>
              )}
            </GHScrollView>
          ) : (
            <Text style={styles.hint}>Swipe right to connect · left to skip · up to message</Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingBottom: 8,
    maxHeight: '44%',
    zIndex: 5,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: tokens.colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    overflow: 'hidden',
    minHeight: 120,
    maxHeight: '100%',
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
      },
      android: { elevation: 8 },
    }),
  },
  rail: {
    width: 5,
    marginVertical: 16,
    marginLeft: 12,
    borderRadius: 3,
    backgroundColor: tokens.colors.accent,
  },
  body: {
    flex: 1,
    minWidth: 0,
    paddingTop: 16,
    paddingRight: 16,
    paddingBottom: 14,
  },
  header: {
    marginBottom: 10,
  },
  name: {
    fontSize: 24,
    fontWeight: '800',
    color: tokens.colors.text,
    letterSpacing: -0.4,
  },
  location: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '500',
    color: tokens.colors.textMuted,
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  label: {
    fontSize: 11,
    fontWeight: '800',
    color: tokens.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginTop: 6,
    marginBottom: 4,
  },
  text: {
    fontSize: 15,
    lineHeight: 22,
    color: tokens.colors.textSecondary,
  },
  hint: {
    fontSize: 14,
    lineHeight: 20,
    color: tokens.colors.textMuted,
    marginTop: 4,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: tokens.radius.full,
    backgroundColor: tokens.colors.filterBgSky,
    borderWidth: 1,
    borderColor: tokens.colors.filterBorderSky,
  },
  tagText: {
    fontSize: 13,
    fontWeight: '600',
    color: tokens.colors.text,
  },
});
