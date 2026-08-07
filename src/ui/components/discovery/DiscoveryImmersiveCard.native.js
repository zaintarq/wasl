import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ScrollView as GHScrollView } from 'react-native-gesture-handler';
import { tokens } from '../../tokens';
import { FadeInImage } from '../FadeInImage.native';
import { HuzzPressable } from '../HuzzPressable.native';
import { ProfileVoicePlayer } from '../ProfileVoicePlayer.native';
import { getPresenceDisplay } from '../../utils/presence';

/**
 * Immersive discovery card — full-bleed photo + overlapping info sheet (not a centered floating tile).
 */
export function DiscoveryImmersiveCard({ user, onPhotoPress }) {
  const hasAbout = useMemo(() => {
    if (!user) return false;
    return (
      !!String(user?.bio || '').trim() ||
      !!String(user?.addMe || '').trim() ||
      (Array.isArray(user?.interests) && user.interests.length > 0) ||
      !!String(user?.aboutVoiceUrl || '').trim()
    );
  }, [user]);

  const photoUri = String(user?.images?.[0] || '');
  const canOpenGallery =
    Array.isArray(user?.images) &&
    user.images.some((x) => typeof x === 'string' && String(x).trim().length > 0);

  return (
    <View style={styles.root}>
      <HuzzPressable
        style={[styles.photoZone, !hasAbout && styles.photoZoneTall]}
        onPress={() => onPhotoPress?.(user)}
        haptic="light"
        disabled={!canOpenGallery}
      >
        <FadeInImage
          source={{ uri: photoUri }}
          style={styles.photo}
          resizeMode="cover"
          contentPosition="top"
        />
        <LinearGradient
          colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0.72)']}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFill}
        />

        <View style={styles.photoTopRow} pointerEvents="box-none">
          {user?._isPendingRequest ? (
            <View style={[styles.pill, styles.pillAccent]}>
              <Text style={[styles.pillText, styles.pillAccentText]}>Wants to connect</Text>
            </View>
          ) : null}
          {!user?._isPendingRequest &&
            (() => {
              const p = getPresenceDisplay(user?.lastSeen);
              if (!p) return null;
              return (
                <View style={styles.pill}>
                  <Text style={[styles.pillText, p.kind === 'online' ? styles.pillOnline : null]}>
                    {p.kind === 'online' ? '● ' : ''}
                    {p.label}
                  </Text>
                </View>
              );
            })()}
        </View>

        {!hasAbout ? (
          <View style={styles.photoCaption}>
            <View style={styles.nameRow}>
              <Text style={styles.nameOnPhoto}>{user?.name || 'User'}</Text>
              {user?.isVerified ? <Text style={styles.verified}> ✓</Text> : null}
              {user?.age ? <Text style={styles.ageOnPhoto}> · {user.age}</Text> : null}
            </View>
            <Text style={styles.locationOnPhoto} numberOfLines={1}>
              {user?.location || user?.countryOfResidence || 'Nearby'}
              {user?.distance ? ` · ${user.distance} km` : ''}
            </Text>
          </View>
        ) : null}
      </HuzzPressable>

      {hasAbout ? (
        <View style={styles.sheet}>
          <View style={styles.sheetRail} />
          <View style={styles.sheetInner}>
            <View style={styles.sheetHeader}>
              <View style={styles.nameRow}>
                <Text style={styles.name}>{user?.name || 'User'}</Text>
                {user?.isVerified ? <Text style={styles.verifiedDark}> ✓</Text> : null}
                {user?.age ? <Text style={styles.age}> · {user.age}</Text> : null}
              </View>
              <Text style={styles.location} numberOfLines={1}>
                {user?.location || user?.countryOfResidence || 'Nearby'}
                {user?.distance ? ` · ${user.distance} km` : ''}
              </Text>
            </View>

            <GHScrollView
              style={styles.sheetScroll}
              contentContainerStyle={styles.sheetScrollContent}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {!!String(user?.bio || '').trim() && (
                <>
                  <Text style={styles.sectionLabel}>About</Text>
                  <Text style={styles.bodyText}>{String(user.bio)}</Text>
                </>
              )}
              {!!String(user?.addMe || '').trim() && (
                <>
                  <Text style={styles.sectionLabel}>Add me</Text>
                  <Text style={styles.bodyText}>{String(user.addMe).trim()}</Text>
                </>
              )}
              {(user?.interests || []).length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>Interests</Text>
                  <View style={styles.tags}>
                    {(user.interests || []).slice(0, 12).map((interest, idx) => (
                      <View key={`${interest}-${idx}`} style={styles.tag}>
                        <Text style={styles.tagText}>{interest}</Text>
                      </View>
                    ))}
                  </View>
                </>
              )}
              {!!String(user?.aboutVoiceUrl || '').trim() && (
                <>
                  <Text style={styles.sectionLabel}>Voice</Text>
                  <ProfileVoicePlayer
                    audioUrl={String(user.aboutVoiceUrl).trim()}
                    durationMs={user?.aboutVoiceDurationMs}
                  />
                </>
              )}
            </GHScrollView>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const SHEET_RADIUS = 28;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#0f172a',
    borderRadius: SHEET_RADIUS,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.22,
        shadowRadius: 18,
      },
      android: { elevation: 8 },
    }),
  },
  photoZone: {
    flex: 1.05,
    minHeight: 220,
    position: 'relative',
  },
  photoZoneTall: {
    flex: 1,
  },
  photo: {
    ...StyleSheet.absoluteFillObject,
  },
  photoTopRow: {
    position: 'absolute',
    top: 14,
    left: 14,
    right: 14,
    gap: 8,
    alignItems: 'flex-start',
  },
  pill: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: tokens.radius.full,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  pillAccent: {
    backgroundColor: 'rgba(225, 29, 72, 0.85)',
    borderColor: 'rgba(255,255,255,0.35)',
  },
  pillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  pillAccentText: {
    color: '#fff',
  },
  pillOnline: {
    color: '#D1FAE5',
  },
  photoCaption: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 18,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
  },
  nameOnPhoto: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.3,
  },
  ageOnPhoto: {
    fontSize: 18,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.92)',
  },
  locationOnPhoto: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.88)',
  },
  sheet: {
    flex: 0.95,
    maxHeight: '46%',
    flexDirection: 'row',
    marginTop: -SHEET_RADIUS,
    backgroundColor: tokens.colors.surface,
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: tokens.colors.border,
    overflow: 'hidden',
  },
  sheetRail: {
    width: 5,
    marginTop: SHEET_RADIUS,
    marginBottom: 12,
    marginLeft: 10,
    borderRadius: 3,
    backgroundColor: tokens.colors.accent,
    opacity: 0.9,
  },
  sheetInner: {
    flex: 1,
    minWidth: 0,
    paddingTop: 14,
    paddingRight: 14,
    paddingBottom: 8,
  },
  sheetHeader: {
    marginBottom: 8,
    paddingRight: 4,
  },
  name: {
    fontSize: 22,
    fontWeight: '800',
    color: tokens.colors.text,
    letterSpacing: -0.3,
  },
  age: {
    fontSize: 16,
    fontWeight: '600',
    color: tokens.colors.textSecondary,
  },
  verified: {
    color: '#6EE7B7',
    fontSize: 16,
    fontWeight: '700',
  },
  verifiedDark: {
    color: tokens.colors.green,
    fontSize: 14,
    fontWeight: '700',
  },
  location: {
    marginTop: 4,
    fontSize: 13,
    color: tokens.colors.textMuted,
    fontWeight: '500',
  },
  sheetScroll: {
    flex: 1,
    minHeight: 0,
  },
  sheetScrollContent: {
    paddingBottom: 16,
    paddingRight: 4,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: tokens.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 8,
    marginBottom: 4,
  },
  bodyText: {
    fontSize: 14,
    lineHeight: 20,
    color: tokens.colors.textSecondary,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: tokens.radius.full,
    backgroundColor: tokens.colors.filterBgSky,
    borderWidth: 1,
    borderColor: tokens.colors.filterBorderSky,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '600',
    color: tokens.colors.text,
  },
});
