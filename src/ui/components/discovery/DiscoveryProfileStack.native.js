import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Platform, ScrollView } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { Maximize2 } from 'lucide-react-native';
import { tokens } from '../../tokens';
import { FadeInImage } from '../FadeInImage.native';
import { HuzzPressable } from '../HuzzPressable.native';
import { ProfileVoicePlayer } from '../ProfileVoicePlayer.native';
import { LiveText } from '../live/LiveTypography.native';
import { getPresenceDisplay } from '../../../utils/presence';

const CARD_OVERLAP = 24;
const PHOTO_FLEX = 44;

function InfoBlock({ label, value }) {
  const text = String(value || '').trim() || '—';
  return (
    <View style={styles.infoBlock}>
      <LiveText style={styles.infoLabel}>{label}</LiveText>
      <LiveText style={styles.infoValue} numberOfLines={4}>
        {text}
      </LiveText>
    </View>
  );
}

/** Split layout — photo top, structured info card below. */
export function DiscoveryProfileStack({ user, onPhotoPress, panGesture, isTop }) {
  const images = useMemo(
    () =>
      (Array.isArray(user?.images) ? user.images : []).filter(
        (x) => typeof x === 'string' && String(x).trim().length > 0
      ),
    [user?.images]
  );
  const userKey = user?.id ?? user?.uid ?? user?.name ?? '';
  const [photoIndex, setPhotoIndex] = useState(0);

  useEffect(() => {
    setPhotoIndex(0);
  }, [userKey]);

  const activeUri = images[photoIndex] || images[0] || '';
  const hasMultiple = images.length > 1;
  const canOpenGallery = images.length > 0;

  const openExpanded = useCallback(() => {
    if (!canOpenGallery) return;
    onPhotoPress?.(user, photoIndex);
  }, [canOpenGallery, onPhotoPress, photoIndex, user]);

  const goNextPhoto = useCallback(() => {
    if (!hasMultiple) {
      openExpanded();
      return;
    }
    setPhotoIndex((i) => (i + 1) % images.length);
  }, [hasMultiple, images.length, openExpanded]);

  const goPrevPhoto = useCallback(() => {
    if (!hasMultiple) return;
    setPhotoIndex((i) => (i - 1 + images.length) % images.length);
  }, [hasMultiple, images.length]);

  const interestsText = useMemo(() => {
    const list = Array.isArray(user?.interests) ? user.interests.filter(Boolean) : [];
    return list.slice(0, 8).join(', ');
  }, [user?.interests]);

  const presence = useMemo(() => getPresenceDisplay(user?.lastSeen), [user?.lastSeen]);

  const photoBlock = (
    <View style={styles.photoSection}>
      <FadeInImage
        source={{ uri: activeUri }}
        style={styles.photo}
        resizeMode="cover"
        contentPosition="top"
      />

      {hasMultiple ? (
        <>
          <HuzzPressable
            style={styles.tapZoneLeft}
            onPress={goPrevPhoto}
            haptic="light"
            accessibilityLabel="Previous photo"
          />
          <HuzzPressable
            style={styles.tapZoneRight}
            onPress={goNextPhoto}
            haptic="light"
            accessibilityLabel="Next photo"
          />
        </>
      ) : (
        <HuzzPressable
          style={StyleSheet.absoluteFill}
          onPress={openExpanded}
          haptic="light"
          disabled={!canOpenGallery}
          accessibilityLabel="View full photo"
        />
      )}

      {canOpenGallery ? (
        <HuzzPressable
          style={styles.expandBtn}
          onPress={openExpanded}
          onLongPress={openExpanded}
          haptic="light"
          accessibilityLabel="Expand photo"
        >
          <Maximize2 size={18} color="#fff" strokeWidth={2.2} />
        </HuzzPressable>
      ) : null}

      {hasMultiple ? (
        <View style={styles.photoSegments} pointerEvents="none">
          {images.slice(0, 6).map((_, idx) => (
            <View
              key={idx}
              style={[styles.photoSegment, idx === photoIndex && styles.photoSegmentActive]}
            />
          ))}
        </View>
      ) : null}

      {user?._isPendingRequest ? (
        <View style={styles.pendingBadge} pointerEvents="none">
          <LiveText style={styles.pendingText}>Wants to connect</LiveText>
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={styles.root}>
      {panGesture && isTop ? (
        <GestureDetector gesture={panGesture}>{photoBlock}</GestureDetector>
      ) : (
        photoBlock
      )}

      <View style={styles.infoCardWrap}>
        <View style={styles.infoCard}>
          <ScrollView
            style={styles.infoScroll}
            contentContainerStyle={styles.infoScrollContent}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <LiveText style={styles.profileName} numberOfLines={1}>
              {user?.name || 'User'}
              {user?.age ? `, ${user.age}` : ''}
              {user?.isVerified ? ' ✓' : ''}
            </LiveText>
            <LiveText style={styles.profileLocation} numberOfLines={1}>
              {user?.location || user?.countryOfResidence || 'Nearby'}
              {user?.distance ? ` · ${user.distance} km` : ''}
            </LiveText>

            {presence ? (
              <View style={styles.presenceRow}>
                {presence.kind === 'online' ? <View style={styles.presenceDot} /> : null}
                <LiveText
                  style={[
                    styles.presenceText,
                    presence.kind === 'online' && styles.presenceTextOnline,
                  ]}
                >
                  {presence.kind === 'online' ? 'Online now' : presence.label}
                </LiveText>
              </View>
            ) : null}

            <View style={styles.infoGrid}>
              <InfoBlock label="Religion" value={user?.religion} />
              <InfoBlock label="Add me" value={user?.addMe} />
              <InfoBlock label="About" value={user?.bio} />
              <InfoBlock label="Interests" value={interestsText || undefined} />
            </View>

            {!!String(user?.aboutVoiceUrl || '').trim() && (
              <View style={styles.voiceBlock}>
                <LiveText style={styles.infoLabel}>Voice</LiveText>
                <ProfileVoicePlayer
                  audioUrl={String(user.aboutVoiceUrl).trim()}
                  durationMs={user?.aboutVoiceDurationMs}
                />
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: '100%',
    height: '100%',
    minHeight: 0,
    backgroundColor: tokens.colors.bg,
  },
  photoSection: {
    flex: PHOTO_FLEX,
    minHeight: 180,
    width: '100%',
    overflow: 'hidden',
    backgroundColor: '#0f172a',
  },
  photo: {
    ...StyleSheet.absoluteFillObject,
  },
  tapZoneLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '38%',
    zIndex: 4,
  },
  tapZoneRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: '62%',
    zIndex: 4,
  },
  expandBtn: {
    position: 'absolute',
    top: 28,
    right: 14,
    zIndex: 5,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  photoSegments: {
    position: 'absolute',
    top: 10,
    left: 14,
    right: 14,
    flexDirection: 'row',
    gap: 4,
    zIndex: 2,
  },
  photoSegment: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  photoSegmentActive: {
    backgroundColor: '#fff',
  },
  pendingBadge: {
    position: 'absolute',
    top: 22,
    left: 14,
    backgroundColor: 'rgba(225, 29, 72, 0.9)',
    borderRadius: tokens.radius.full,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  pendingText: {
    ...tokens.typography.caption,
    fontWeight: '700',
    color: '#fff',
  },
  infoCardWrap: {
    flex: 100 - PHOTO_FLEX,
    minHeight: 0,
    marginTop: -CARD_OVERLAP,
    zIndex: 3,
    paddingHorizontal: 12,
  },
  infoCard: {
    flex: 1,
    backgroundColor: tokens.colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: tokens.colors.border,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: -6 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
      },
      android: { elevation: 6 },
    }),
  },
  infoScroll: {
    flex: 1,
    minHeight: 0,
  },
  infoScrollContent: {
    paddingTop: 20,
    paddingHorizontal: 18,
    paddingBottom: 16,
  },
  profileName: {
    ...tokens.typography.titleLarge,
    color: tokens.colors.text,
    lineHeight: 32,
  },
  profileLocation: {
    ...tokens.typography.bodySmall,
    marginTop: 4,
    color: tokens.colors.textMuted,
  },
  presenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  presenceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: tokens.colors.green,
  },
  presenceText: {
    ...tokens.typography.caption,
    color: tokens.colors.textMuted,
  },
  presenceTextOnline: {
    color: tokens.colors.green,
    fontWeight: '600',
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 16,
  },
  infoBlock: {
    width: '47.5%',
    minHeight: 72,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    backgroundColor: tokens.colors.surfaceElevated,
  },
  infoLabel: {
    ...tokens.typography.caption,
    fontSize: 11,
    fontWeight: '700',
    color: tokens.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  infoValue: {
    ...tokens.typography.label,
    fontSize: 15,
    lineHeight: 20,
    color: tokens.colors.text,
  },
  voiceBlock: {
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    backgroundColor: tokens.colors.surfaceElevated,
  },
});
